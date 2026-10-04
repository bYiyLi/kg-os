package webstore

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPathIdentitySurvivesImmediateReplacement(t *testing.T) {
	for _, directory := range []bool{false, true} {
		for _, warm := range []bool{false, true} {
			name := "file/cold"
			if directory {
				name = "directory/cold"
			}
			if warm {
				name = name[:len(name)-len("cold")] + "warm"
			}
			t.Run(name, func(t *testing.T) {
				path := filepath.Join(t.TempDir(), "managed")
				create := func() {
					t.Helper()
					var err error
					if directory {
						err = os.Mkdir(path, 0o700)
					} else {
						err = os.WriteFile(path, []byte("original"), 0o600)
					}
					if err != nil {
						t.Fatal(err)
					}
				}
				create()
				original, err := pathIdentity(path, directory)
				if err != nil {
					t.Fatal(err)
				}
				if warm {
					current, err := pathIdentity(path, directory)
					if err != nil || !os.SameFile(original, current) {
						t.Fatalf("unchanged path has a different identity: %v", err)
					}
				}
				if err := os.Rename(path, path+".archived"); err != nil {
					t.Fatal(err)
				}
				create()
				replacement, err := pathIdentity(path, directory)
				if err != nil {
					t.Fatal(err)
				}
				if os.SameFile(original, replacement) {
					t.Fatal("replacement changed the previously captured identity")
				}
				archived, err := pathIdentity(path+".archived", directory)
				if err != nil || !os.SameFile(original, archived) {
					t.Fatalf("snapshot no longer identifies the archived original: %v", err)
				}
			})
		}
	}
}

func TestPathIdentityRejectsInvalidManagedPaths(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "file")
	if err := os.WriteFile(file, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, input := range []struct {
		path      string
		directory bool
	}{
		{file, true},
		{root, false},
		{filepath.Join(root, "missing"), false},
		{filepath.Join(root, "missing"), true},
	} {
		if _, err := pathIdentity(input.path, input.directory); err == nil {
			t.Fatalf("unsafe identity accepted: %+v", input)
		}
	}
}
