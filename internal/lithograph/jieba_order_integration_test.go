//go:build lithograph_smoke

package lithograph

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestOfficialJiebaReplacesCallerRegistration(t *testing.T) {
	shadow := buildShadowJieba(t)
	caller := runtimeprofile.ResolvedExtension{Library: shadow, Entrypoint: "sqlite3_shadowjieba_init"}
	ctx := context.Background()

	// The caller extension deliberately gives the official name unicode61
	// semantics. Its failure to match this corpus makes the order observable.
	driver := registerDriver([]runtimeprofile.ResolvedExtension{caller})
	shadowOnly, err := sql.Open(driver, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	shadowConnection, err := shadowOnly.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := countJiebaProbe(t, shadowConnection); got != 0 {
		t.Fatalf("caller shadow tokenizer matched %d rows, want zero", got)
	}
	_ = shadowConnection.Close()
	_ = shadowOnly.Close()

	paths := integrationPaths(t)
	base := integrationExtensions(t)
	extensions := append(append([]runtimeprofile.ResolvedExtension{}, base[:2]...), caller, base[2])
	host, err := Open(ctx, paths.Database, extensions, "jieba", integrationSemantic(paths, false))
	if err != nil {
		t.Fatalf("open with caller shadow before official Jieba: %v", err)
	}
	defer host.Close()
	connection, err := host.writeDB.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if got := countJiebaProbe(t, connection); got != 1 {
		t.Fatalf("official Jieba matched %d rows after caller shadow, want one", got)
	}
}

func countJiebaProbe(t *testing.T, connection *sql.Conn) int {
	t.Helper()
	ctx := context.Background()
	if _, err := connection.ExecContext(ctx, "CREATE VIRTUAL TABLE temp.phase10_jieba_order USING fts5(body, tokenize='jieba')"); err != nil {
		t.Fatal(err)
	}
	if _, err := connection.ExecContext(ctx, "INSERT INTO temp.phase10_jieba_order(body) VALUES ('这是知识图。')"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := connection.QueryRowContext(ctx, "SELECT count(*) FROM temp.phase10_jieba_order WHERE phase10_jieba_order MATCH '知识图'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func buildShadowJieba(t *testing.T) string {
	t.Helper()
	module := exec.Command("go", "list", "-m", "-f", "{{.Dir}}", "github.com/mattn/go-sqlite3")
	headerDirectory, err := module.Output()
	if err != nil {
		t.Fatalf("locate SQLite extension headers: %v", err)
	}
	suffix := ".so"
	args := []string{"-fPIC", "-shared"}
	if runtime.GOOS == "darwin" {
		suffix = ".dylib"
		args = []string{"-fPIC", "-dynamiclib", "-undefined", "dynamic_lookup"}
	}
	library := filepath.Join(t.TempDir(), "shadow-jieba"+suffix)
	args = append(args, "-I", strings.TrimSpace(string(headerDirectory)), "-o", library, filepath.Join("..", "..", "tests", "fixtures", "shadow_jieba.c"))
	compiler := os.Getenv("CC")
	if compiler == "" {
		compiler = "cc"
	}
	command := exec.Command(compiler, args...)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("compile caller shadow tokenizer: %v\n%s", err, output)
	}
	return library
}
