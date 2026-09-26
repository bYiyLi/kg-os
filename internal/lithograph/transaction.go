package lithograph

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"sync"
)

type Transaction struct {
	mu         sync.Mutex
	host       *Host
	connection *sql.Conn
	closed     bool
}

func (host *Host) Begin(ctx context.Context, options map[string]any) (*Transaction, error) {
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return nil, err
	}
	defer done()
	connection, err := host.acquireWriteConnection(operationCtx)
	if err != nil {
		return nil, err
	}
	effectiveOptions := make(map[string]any, len(options)+1)
	for key, value := range options {
		effectiveOptions[key] = value
	}
	if _, exists := effectiveOptions["branch"]; !exists {
		effectiveOptions["branch"] = "main"
	}
	optionsJSON, err := marshalObject(effectiveOptions)
	if err != nil {
		return nil, errors.Join(fmt.Errorf("encode transaction options: %w", err), releaseWriteConnection(connection))
	}
	if _, err := scalarJSON(operationCtx, connection, "SELECT lithograph_tx_begin(?)", optionsJSON); err != nil {
		discardConnection(connection)
		return nil, fmt.Errorf("begin Lithograph transaction: %w", err)
	}
	transaction := &Transaction{host: host, connection: connection}
	if err := host.registerTransaction(transaction); err != nil {
		return nil, errors.Join(err, transaction.Close())
	}
	return transaction, nil
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

func (transaction *Transaction) Commit(ctx context.Context) ([]byte, error) {
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
