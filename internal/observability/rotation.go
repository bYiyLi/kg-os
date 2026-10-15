package observability

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"sync"
)

const (
	DefaultLogBytes = 10 << 20
	DefaultLogFiles = 5
)

// RotatingWriter has exclusive ownership of kgosd.log. The CLI must not keep
// an inherited append descriptor open against a file that may be renamed.
type RotatingWriter struct {
	mu    sync.Mutex
	root  *os.Root
	file  *os.File
	bytes int64
	limit int64
	files int
}

func NewRotatingWriter(dir string, limit int64, files int) (*RotatingWriter, error) {
	if limit < 1 || files < 1 {
		return nil, errors.New("invalid log rotation limits")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create log directory: %w", err)
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("log directory must be a directory, not a symlink")
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	writer := &RotatingWriter{root: root, limit: limit, files: files}
	if err := writer.open(); err != nil {
		_ = root.Close()
		return nil, err
	}
	return writer, nil
}

func (w *RotatingWriter) open() error {
	info, err := w.root.Lstat("kgosd.log")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err == nil && (!info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0) {
		return errors.New("log target must be a regular file")
	}
	file, err := w.root.OpenFile("kgosd.log", os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		_ = file.Close()
		return errors.New("log target is not a regular file")
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return err
	}
	w.file = file
	w.bytes = info.Size()
	return nil
}

func (w *RotatingWriter) rotate() error {
	if err := w.file.Close(); err != nil {
		return err
	}
	w.file = nil
	for index := w.files - 1; index >= 1; index-- {
		from := "kgosd.log"
		if index > 1 {
			from += "." + strconv.Itoa(index-1)
		}
		to := "kgosd.log." + strconv.Itoa(index)
		if _, err := w.root.Lstat(from); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		if err := w.root.Rename(from, to); err != nil {
			return err
		}
	}
	return w.open()
}

func (w *RotatingWriter) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return 0, io.ErrClosedPipe
	}
	if int64(len(data)) > w.limit {
		// A single oversized diagnostic must not defeat the disk bound.
		return len(data), nil
	}
	if w.bytes+int64(len(data)) > w.limit {
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(data)
	w.bytes += int64(n)
	return n, err
}
func (w *RotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.root == nil {
		return nil
	}
	var err error
	if w.file != nil {
		err = w.file.Close()
		w.file = nil
	}
	closeErr := w.root.Close()
	w.root = nil
	if err != nil {
		return err
	}
	return closeErr
}
