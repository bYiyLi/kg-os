//go:build lithograph_smoke

package lithographtest

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
)

const driverName = "kgos-phase0-lithograph"

var registerDriver sync.Once

func TestLithographV030RealLoad(t *testing.T) {
	mainLibrary := requiredEnvironment(t, "KGOS_LITHOGRAPH_LIBRARY")
	providerLibrary := requiredEnvironment(t, "KGOS_LITHOGRAPH_PROVIDER_LIBRARY")
	registerDriver.Do(func() {
		sql.Register(driverName, &sqlite3.SQLiteDriver{
			ConnectHook: func(connection *sqlite3.SQLiteConn) error {
				if err := connection.LoadExtension(mainLibrary, "sqlite3_lithograph_init"); err != nil {
					return fmt.Errorf("load Lithograph: %w", err)
				}
				if err := connection.LoadExtension(providerLibrary, "sqlite3_lithographopenaicompatible_init"); err != nil {
					return fmt.Errorf("load OpenAI-compatible provider: %w", err)
				}
				return nil
			},
		})
	})

	databasePath := filepath.Join(t.TempDir(), "phase0.sqlite")
	db, err := sql.Open(driverName, databasePath)
	if err != nil {
		t.Fatalf("open SQLite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close SQLite: %v", err)
		}
	})

	requireSQLiteBaseline(t, db)
	requireFTS5(t, db)
	requireLithographVersion(t, db)
	requireLithographExecution(t, db)
	requireLithographRows(t, db)
	requireContextCancellation(t, db)
}

func requiredEnvironment(t *testing.T, name string) string {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		t.Fatalf("%s is required for the real Lithograph smoke", name)
	}
	absolute, err := filepath.Abs(value)
	if err != nil {
		t.Fatalf("resolve %s: %v", name, err)
	}
	return absolute
}

func requireSQLiteBaseline(t *testing.T, db *sql.DB) {
	t.Helper()
	var version string
	if err := db.QueryRow("SELECT sqlite_version()").Scan(&version); err != nil {
		t.Fatalf("read SQLite version: %v", err)
	}
	parts := strings.Split(version, ".")
	if len(parts) < 2 {
		t.Fatalf("invalid SQLite version %q", version)
	}
	major, majorErr := strconv.Atoi(parts[0])
	minor, minorErr := strconv.Atoi(parts[1])
	if majorErr != nil || minorErr != nil || major < 3 || (major == 3 && minor < 45) {
		t.Fatalf("SQLite version %q is below 3.45.0", version)
	}
}

func requireFTS5(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec("CREATE VIRTUAL TABLE temp.phase0_fts USING fts5(body)"); err != nil {
		t.Fatalf("bundled SQLite does not provide FTS5: %v", err)
	}
}

func decodeObject(t *testing.T, raw, label string) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		t.Fatalf("decode %s: %v", label, err)
	}
	return value
}

func requireLithographVersion(t *testing.T, db *sql.DB) {
	t.Helper()
	var raw string
	if err := db.QueryRow("SELECT lithograph_version()").Scan(&raw); err != nil {
		t.Fatalf("read Lithograph version: %v", err)
	}
	version := decodeObject(t, raw, "lithograph_version()")
	if version["extension"] != "0.3.0" {
		t.Fatalf("Lithograph version = %#v, want 0.3.0", version["extension"])
	}
	if version["cypherProfile"] != "CY25-2026.08" {
		t.Fatalf("Cypher profile = %#v, want CY25-2026.08", version["cypherProfile"])
	}
}

func requireLithographExecution(t *testing.T, db *sql.DB) {
	t.Helper()
	var initRaw string
	if err := db.QueryRow("SELECT lithograph_init()").Scan(&initRaw); err != nil {
		t.Fatalf("initialize Lithograph: %v", err)
	}
	initialized := decodeObject(t, initRaw, "lithograph_init()")
	if initialized["storageFormat"] != float64(3) {
		t.Fatalf("storage format = %#v, want 3", initialized["storageFormat"])
	}

	var raw string
	if err := db.QueryRow("SELECT lithograph('RETURN 1 AS value')").Scan(&raw); err != nil {
		t.Fatalf("execute Lithograph query: %v", err)
	}
	result := decodeObject(t, raw, "lithograph()")
	rows, ok := result["rows"].([]any)
	if !ok || len(rows) != 1 {
		t.Fatalf("unexpected Lithograph rows: %#v", result["rows"])
	}
	row, ok := rows[0].([]any)
	if !ok || len(row) != 1 || row[0] != float64(1) {
		t.Fatalf("unexpected Lithograph row: %#v", rows[0])
	}
}

func requireLithographRows(t *testing.T, db *sql.DB) {
	t.Helper()
	rows, err := db.Query("SELECT ordinal,event,data FROM lithograph_rows('RETURN 1 AS value') ORDER BY ordinal")
	if err != nil {
		t.Fatalf("open lithograph_rows(): %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close lithograph_rows(): %v", err)
		}
	}()

	var events []string
	var ordinals []int
	var data []string
	for rows.Next() {
		var ordinal int
		var event string
		var value string
		if err := rows.Scan(&ordinal, &event, &value); err != nil {
			t.Fatalf("scan lithograph_rows(): %v", err)
		}
		ordinals = append(ordinals, ordinal)
		events = append(events, event)
		data = append(data, value)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("consume lithograph_rows(): %v", err)
	}
	if fmt.Sprint(ordinals) != "[0 1 2]" || strings.Join(events, ",") != "columns,row,summary" {
		t.Fatalf("unexpected event stream: ordinals=%v events=%v", ordinals, events)
	}
	if data[0] != "[\"value\"]" || data[1] != "[1]" {
		t.Fatalf("unexpected event payloads: %v", data)
	}
}

func requireContextCancellation(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	expensive := "SELECT count(*) FROM lithograph_rows(" +
		"'UNWIND range(1,1000000000) AS value RETURN value')"
	var ignored int64
	err := db.QueryRowContext(ctx, expensive).Scan(&ignored)
	if err == nil {
		t.Fatal("long-running SQLite query ignored context cancellation")
	}
	if !errors.Is(err, context.DeadlineExceeded) &&
		!errors.Is(err, context.Canceled) &&
		!strings.Contains(strings.ToLower(err.Error()), "interrupt") {
		t.Fatalf("unexpected cancellation error: %v", err)
	}
}
