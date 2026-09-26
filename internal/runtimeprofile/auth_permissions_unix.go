//go:build !windows

package runtimeprofile

import (
	"fmt"
	"os"
)

func ensureCredentialPrivate(path string, info os.FileInfo) error {
	if info == nil {
		var err error
		info, err = os.Stat(path)
		if err != nil {
			return fmt.Errorf("stat auth.json permissions: %w", err)
		}
	}
	if info.Mode().Perm() != 0o600 {
		return fmt.Errorf("auth.json permissions must be 0600")
	}
	return nil
}
