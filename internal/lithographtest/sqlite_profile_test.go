package lithographtest

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestSQLiteBuildProfile(t *testing.T) {
	t.Parallel()

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open bundled SQLite: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close bundled SQLite: %v", err)
		}
	})

	var fts5 int
	if err := db.QueryRow("SELECT sqlite_compileoption_used('ENABLE_FTS5')").Scan(&fts5); err != nil {
		t.Fatalf("probe FTS5 compile option: %v", err)
	}
	if fts5 != 1 {
		t.Fatal("bundled SQLite was built without FTS5")
	}

	var omitLoadExtension int
	if err := db.QueryRow("SELECT sqlite_compileoption_used('OMIT_LOAD_EXTENSION')").Scan(&omitLoadExtension); err != nil {
		t.Fatalf("probe load-extension compile option: %v", err)
	}
	if omitLoadExtension != 0 {
		t.Fatal("bundled SQLite was built with OMIT_LOAD_EXTENSION")
	}
}
