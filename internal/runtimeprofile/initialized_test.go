package runtimeprofile

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func TestInitializationReceiptStrictFormatAndRecovery(t *testing.T) {
	dir := t.TempDir()
	paths, err := ResolvePaths(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	complete, err := InitializationComplete(paths)
	if err != nil || complete {
		t.Fatalf("new Instance falsely marked initialized: %t %v", complete, err)
	}
	if err := PublishInitializationReceipt(paths); err != nil {
		t.Fatal(err)
	}
	complete, err = InitializationComplete(paths)
	if err != nil || !complete {
		t.Fatalf("completed Instance not marked: %t %v", complete, err)
	}
	if err := PublishInitializationReceipt(paths); err != nil {
		t.Fatalf("repeat initialization not idempotent: %v", err)
	}
	location := filepath.Join(paths.Root, "initialized.json")
	info, err := os.Stat(location)
	if err != nil {
		t.Fatal(err)
	}
	// Windows file permission bits do not represent NTFS ACLs.
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Fatalf("receipt permission is not private: %v", info.Mode().Perm())
	}

	for index, body := range []string{
		"not-json", "[]", "null", "{}", "{\"version\":0}", "{\"version\":2}",
		"{\"version\":1,\"extra\":3}", "{\"version\":1}\n{\"version\":2}",
		strings.Repeat("x", 5000),
	} {
		if err := os.WriteFile(location, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		complete, err := InitializationComplete(paths)
		if err == nil || complete {
			t.Errorf("malformed receipt %d accepted: %s", index, body[:min(len(body), 45)])
		}
		if err := PublishInitializationReceipt(paths); err == nil {
			t.Errorf("bad receipt %d was silently overwritten", index)
		}
	}
	if err := os.Remove(location); err != nil {
		t.Fatal(err)
	}
	if err := PublishInitializationReceipt(paths); err != nil {
		t.Fatalf("failed to resume interrupted setup: %v", err)
	}
	if data, err := os.ReadFile(location); err != nil || string(data) != "{\"version\":1}\n" {
		t.Fatalf("unexpected receipt format: %q %v", data, err)
	}
}

func TestInitializationReceiptConcurrentPublisher(t *testing.T) {
	paths, err := ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- PublishInitializationReceipt(paths) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("racing receipt publication failed: %v", err)
		}
	}
	complete, err := InitializationComplete(paths)
	if err != nil || !complete {
		t.Fatalf("concurrent publishers corrupted receipt: %t %v", complete, err)
	}
}

func TestInitializationReceiptMissingRootFailsClosed(t *testing.T) {
	paths, err := ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := PublishInitializationReceipt(paths); err == nil {
		t.Fatal("wrote receipt without established Instance root")
	}
	if err := os.MkdirAll(paths.Root, 0700); err != nil {
		t.Fatal(err)
	}
	// initialized.json may be an inaccessible directory, not a valid receipt.
	if err := os.Mkdir(filepath.Join(paths.Root, "initialized.json"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := InitializationComplete(paths); err == nil {
		t.Fatal("directory receipt was treated as file")
	}
}
