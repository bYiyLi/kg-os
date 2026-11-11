package lithograph

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

type Transaction struct {
	mu         sync.Mutex
	host       *Host
	connection *sql.Conn
	closed     bool
}

// Begin waits on SQLite's physical writer lock in short, context-aware slices.
// A BUSY from the checkout or tx_begin boundary is safe to wait and re-attempt
// on a NEW connection: no caller mutation has run and the failed connection is
// discarded. Never replay Execute, Commit, or a result-unknown write.
func (host *Host) Begin(ctx context.Context, options map[string]any) (*Transaction, error) {
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return nil, err
	}
	defer done()
	effectiveOptions := make(map[string]any, len(options)+1)
	for key, value := range options {
		effectiveOptions[key] = value
	}
	if _, exists := effectiveOptions["branch"]; !exists {
		effectiveOptions["branch"] = "main"
	}
	optionsJSON, err := marshalObject(effectiveOptions)
	if err != nil {
		return nil, fmt.Errorf("encode transaction options: %w", err)
	}
	const maxBeginWait = 15 * time.Second
	until := time.Now().Add(maxBeginWait)
	for {
		if err := operationCtx.Err(); err != nil {
			return nil, err
		}
		connection, err := host.acquireWriteConnectionForBegin(operationCtx)
		if err == nil {
			if _, err = scalarJSON(operationCtx, connection, "SELECT lithograph_tx_begin(?)", optionsJSON); err != nil {
				discardConnection(connection)
				err = fmt.Errorf("begin Lithograph transaction: %w", err)
			} else {
				// Subsequent statements may need the full write budget. The
				// temporary 250ms begin busy handler must not leak into the pool.
				if _, restoreErr := connection.ExecContext(operationCtx, "PRAGMA busy_timeout = 15000"); restoreErr != nil {
					discardConnection(connection)
					return nil, fmt.Errorf("restore write busy timeout after begin: %w", normalizeDatabaseError(restoreErr))
				}
				if err := operationCtx.Err(); err != nil {
					// Begin may have finished exactly as the client timed out.
					// Never hand an already-canceled transaction to the caller.
					discardConnection(connection)
					return nil, err
				}
				transaction := &Transaction{host: host, connection: connection}
				if registerErr := host.registerTransaction(transaction); registerErr != nil {
					return nil, errors.Join(registerErr, transaction.Close())
				}
				// Registration may have waited for the Host lifecycle mutex
				// while the request was canceled. Never hand a canceled
				// transaction to the caller; abort it through normal cleanup.
				if err := operationCtx.Err(); err != nil {
					return nil, errors.Join(err, transaction.Close())
				}
				return transaction, nil
			}
		}
		if canceled := operationCtx.Err(); canceled != nil {
			return nil, canceled
		}
		category, _, _, typed := ErrorDetails(err)
		if !typed || category != CategoryBusy || !time.Now().Before(until) {
			return nil, err
		}
		// This is a lock wait, NOT an application-mutation retry.
		remaining := time.Until(until)
		delay := 50 * time.Millisecond
		if remaining < delay {
			delay = remaining
		}
		timer := time.NewTimer(delay)
		select {
		case <-operationCtx.Done():
			timer.Stop()
			return nil, operationCtx.Err()
		case <-timer.C:
		}
	}
}

func (transaction *Transaction) Execute(
	ctx context.Context,
	cypher string,
	params map[string]any,
	options map[string]any,
) (Result, error) {
	operationCtx, done, err := transaction.host.operationContext(ctx)
	if err != nil {
		return Result{}, err
	}
	defer done()
	transaction.mu.Lock()
	defer transaction.mu.Unlock()
	if transaction.closed {
		return Result{}, fmt.Errorf("lithograph transaction is closed")
	}
	result, err := executeRaw(operationCtx, transaction.connection, cypher, params, options)
	if err != nil {
		return Result{}, errors.Join(err, transaction.failClosed())
	}
	return result, nil
}

func (transaction *Transaction) Stream(
	ctx context.Context,
	cypher string,
	params map[string]any,
	options map[string]any,
	consume func(Event) error,
) error {
	operationCtx, done, err := transaction.host.operationContext(ctx)
	if err != nil {
		return err
	}
	defer done()
	transaction.mu.Lock()
	defer transaction.mu.Unlock()
	if transaction.closed {
		return fmt.Errorf("lithograph transaction is closed")
	}
	if err := streamRaw(operationCtx, transaction.connection, cypher, params, options, consume); err != nil {
		return errors.Join(err, transaction.failClosed())
	}
	return nil
}

func (transaction *Transaction) Commit(ctx context.Context) (rawCommit []byte, returnErr error) {
	ctx, span := observability.StartSpan(ctx, "lithograph.commit")
	defer span.End()
	defer func() {
		if returnErr != nil {
			observability.SpanOutcome(span, "unknown")
		} else {
			observability.SpanOutcome(span, "committed")
		}
	}()
	started := time.Now()
	defer func() { observeDatabaseOperation(ctx, "commit", started, returnErr) }()
	operationCtx, done, err := transaction.host.operationContext(ctx)
	if err != nil {
		return nil, err
	}
	defer done()
	transaction.mu.Lock()
	defer transaction.mu.Unlock()
	if transaction.closed {
		return nil, fmt.Errorf("lithograph transaction is closed")
	}
	raw, err := scalarJSON(operationCtx, transaction.connection, "SELECT lithograph_tx_commit()")
	if err != nil {
		return nil, errors.Join(fmt.Errorf("commit Lithograph transaction: %w", err), transaction.failClosed())
	}
	transaction.closed = true
	closeErr := releaseWriteConnection(transaction.connection)
	transaction.connection = nil
	transaction.host.unregisterTransaction(transaction)
	if closeErr != nil {
		return nil, fmt.Errorf("release committed Lithograph connection: %w", closeErr)
	}
	return raw, nil
}

func (transaction *Transaction) Abort(ctx context.Context) error {
	operationCtx, done, err := transaction.host.operationContext(ctx)
	if err != nil {
		return err
	}
	defer done()
	transaction.mu.Lock()
	defer transaction.mu.Unlock()
	if transaction.closed {
		return fmt.Errorf("lithograph transaction is closed")
	}
	_, err = scalarJSON(operationCtx, transaction.connection, "SELECT lithograph_tx_abort()")
	if err != nil {
		return errors.Join(fmt.Errorf("abort Lithograph transaction: %w", err), transaction.failClosed())
	}
	transaction.closed = true
	closeErr := releaseWriteConnection(transaction.connection)
	transaction.connection = nil
	transaction.host.unregisterTransaction(transaction)
	if closeErr != nil {
		return fmt.Errorf("release aborted Lithograph connection: %w", closeErr)
	}
	return nil
}

func (transaction *Transaction) Close() error {
	transaction.mu.Lock()
	defer transaction.mu.Unlock()
	if transaction.closed {
		return nil
	}
	if transaction.connection == nil {
		transaction.closed = true
		transaction.host.unregisterTransaction(transaction)
		return nil
	}
	cleanupCtx, cancel := context.WithTimeout(context.Background(), writeCleanupTimeout)
	defer cancel()
	if _, err := scalarJSON(cleanupCtx, transaction.connection, "SELECT lithograph_tx_abort()"); err != nil {
		discardConnection(transaction.connection)
		transaction.connection = nil
		transaction.closed = true
		transaction.host.unregisterTransaction(transaction)
		return fmt.Errorf("abort Lithograph transaction during close: %w", err)
	}
	transaction.closed = true
	err := releaseWriteConnection(transaction.connection)
	transaction.connection = nil
	transaction.host.unregisterTransaction(transaction)
	return err
}

func (transaction *Transaction) failClosed() error {
	if transaction.connection == nil {
		transaction.closed = true
		transaction.host.unregisterTransaction(transaction)
		return nil
	}
	cleanupCtx, cancel := context.WithTimeout(context.Background(), writeCleanupTimeout)
	defer cancel()
	var cleanupErr error
	if requireAutoCommit(transaction.connection) != nil {
		if _, err := scalarJSON(cleanupCtx, transaction.connection, "SELECT lithograph_tx_abort()"); err != nil {
			cleanupErr = fmt.Errorf("abort failed Lithograph transaction: %w", err)
		}
	}
	if cleanupErr != nil {
		discardConnection(transaction.connection)
	} else {
		cleanupErr = releaseWriteConnection(transaction.connection)
	}
	transaction.connection = nil
	transaction.closed = true
	transaction.host.unregisterTransaction(transaction)
	return cleanupErr
}

func discardConnection(connection *sql.Conn) {
	_ = connection.Raw(func(any) error {
		return driver.ErrBadConn
	})
	_ = connection.Close()
}
