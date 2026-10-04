//go:build windows

package webstore

import (
	"os"
	"path/filepath"
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestWindowsWebFilesHaveProtectedCurrentUserACL(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	if result, err := store.CacheWrite(testContext, cacheFixture(info.StoreID, frame)); err != nil || !result.Stored {
		t.Fatalf("cache: %+v %v", result, err)
	}
	exported, err := store.Export(testContext)
	if err != nil {
		t.Fatal(err)
	}
	defer exported.Close()
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{store.root, store.path, store.path + "-wal", store.path + "-shm", store.cacheDir, store.cachePath(frame.ID), exported.path} {
		descriptor, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
		if err != nil {
			t.Fatal(err)
		}
		control, _, err := descriptor.Control()
		if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
			t.Fatalf("unprotected ACL %s: %v", filepath.Base(path), err)
		}
		dacl, _, err := descriptor.DACL()
		if err != nil || dacl == nil || dacl.AceCount != 1 {
			t.Fatalf("unexpected ACL %s: %+v %v", filepath.Base(path), dacl, err)
		}
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(dacl, 0, &ace); err != nil {
			t.Fatal(err)
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if !sid.Equals(user.User.Sid) {
			t.Fatalf("ACL grants another principal for %s", filepath.Base(path))
		}
	}
}

func TestWindowsRejectsWebJunctionRedirection(t *testing.T) {
	root := filepath.Join(t.TempDir(), "web")
	outside := t.TempDir()
	// Creating symlinks may require Developer Mode; a successful fixture must
	// be rejected as a reparse point before any data is read or written.
	if err := os.Symlink(outside, root); err != nil {
		t.Skipf("Windows symlink fixture unavailable: %v", err)
	}
	store := New(root, testDatabase)
	defer store.Close()
	if info := store.Info(testContext); info.StorageStatus != "unavailable" {
		t.Fatalf("Windows redirection accepted: %+v", info)
	}
}
