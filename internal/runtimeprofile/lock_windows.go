//go:build windows

package runtimeprofile

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

var errFileLocked = errors.New("file is already locked")

func tryFileLock(file *os.File) error {
	// Lock beyond the locator body so other handles can read it while the daemon owns the lock.
	overlapped := windows.Overlapped{OffsetHigh: 1}
	err := windows.LockFileEx(
		windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0,
		1,
		0,
		&overlapped,
	)
	if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
		return errFileLocked
	}
	return err
}

func unlockFile(file *os.File) error {
	overlapped := windows.Overlapped{OffsetHigh: 1}
	return windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, &overlapped)
}
