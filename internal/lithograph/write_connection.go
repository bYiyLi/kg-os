package lithograph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const writeCleanupTimeout = 5 * time.Second

// acquireWriteConnection establishes the same starting Branch for every
// operation, including Version procedures that do not select one explicitly.
func (host *Host) acquireWriteConnection(ctx context.Context) (*sql.Conn, error) {
	connection, err := host.acquire(ctx, host.writeDB)
	if err != nil {
		return nil, err
	}
	if err := checkoutReusableMain(ctx, connection); err != nil {
		discardConnection(connection)
		return nil, fmt.Errorf("establish write connection baseline: %w", err)
	}
	return connection, nil
}

// releaseWriteConnection never returns an unverified connection to the pool.
// Cleanup is independent of the request context, which may have been canceled
// by a disconnected client or an incomplete stream.
func releaseWriteConnection(connection *sql.Conn) error {
	ctx, cancel := context.WithTimeout(context.Background(), writeCleanupTimeout)
	defer cancel()
	if err := checkoutReusableMain(ctx, connection); err != nil {
		discardConnection(connection)
		return fmt.Errorf("discard unsafe write connection: %w", err)
	}
	if err := connection.Close(); err != nil {
		return fmt.Errorf("release write connection: %w", err)
	}
	return nil
}

func checkoutReusableMain(ctx context.Context, connection *sql.Conn) error {
	if err := requireAutoCommit(connection); err != nil {
		return err
	}
	result, err := executeRaw(ctx, connection, "CALL lithograph.branch.checkout('main')", nil, nil)
	if err != nil {
		return fmt.Errorf("checkout main: %w", err)
	}
	if len(result.Rows) != 1 {
		return fmt.Errorf("checkout main returned %d rows, want 1", len(result.Rows))
	}
	name, err := stringCell(result, 0, "name")
	if err != nil || name != "main" {
		return fmt.Errorf("checkout main returned an invalid Branch")
	}
	if err := requireAutoCommit(connection); err != nil {
		return err
	}
	return nil
}

func joinWriteCleanup(operationErr *error, connection *sql.Conn) {
	*operationErr = errors.Join(*operationErr, releaseWriteConnection(connection))
}
