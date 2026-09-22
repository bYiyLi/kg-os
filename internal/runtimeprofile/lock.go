package runtimeprofile

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
)

var ErrLocked = errors.New("KG_HOME is already owned by another kgosd")

type InstanceLock struct {
	mu     sync.Mutex
	file   *os.File
	closed bool
}

type lockRecord struct {
	Endpoint string `json:"endpoint"`
}

func AcquireLock(path string) (*InstanceLock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open kgosd.lock: %w", err)
	}
	if err := tryFileLock(file); err != nil {
		_ = file.Close()
		if errors.Is(err, errFileLocked) {
			return nil, ErrLocked
		}
		return nil, fmt.Errorf("acquire kgosd.lock: %w", err)
	}
	lock := &InstanceLock{file: file}
	if err := lock.replace(nil); err != nil {
		_ = lock.Close()
		return nil, err
	}
	return lock, nil
}

func (lock *InstanceLock) PublishEndpoint(endpoint string) error {
	if endpoint == "" {
		return fmt.Errorf("endpoint must be non-empty")
	}
	body, err := json.Marshal(lockRecord{Endpoint: endpoint})
	if err != nil {
		return fmt.Errorf("encode kgosd.lock: %w", err)
	}
	body = append(body, '\n')
	return lock.replace(body)
}

func (lock *InstanceLock) Endpoint() (string, error) {
	lock.mu.Lock()
	defer lock.mu.Unlock()
	if lock.closed {
		return "", os.ErrClosed
	}
	if _, err := lock.file.Seek(0, io.SeekStart); err != nil {
		return "", fmt.Errorf("seek kgosd.lock: %w", err)
	}
	decoder := json.NewDecoder(lock.file)
	decoder.DisallowUnknownFields()
	var record lockRecord
	if err := decoder.Decode(&record); err != nil {
		return "", fmt.Errorf("decode kgosd.lock: %w", err)
	}
	if record.Endpoint == "" {
		return "", fmt.Errorf("kgosd.lock endpoint is empty")
	}
	return record.Endpoint, nil
}

func (lock *InstanceLock) replace(body []byte) error {
	lock.mu.Lock()
	defer lock.mu.Unlock()
	if lock.closed {
		return os.ErrClosed
	}
	if err := lock.file.Truncate(0); err != nil {
		return fmt.Errorf("truncate kgosd.lock: %w", err)
	}
	if _, err := lock.file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek kgosd.lock: %w", err)
	}
	if len(body) != 0 {
		if _, err := lock.file.Write(body); err != nil {
			return fmt.Errorf("write kgosd.lock: %w", err)
		}
	}
	if err := lock.file.Sync(); err != nil {
		return fmt.Errorf("sync kgosd.lock: %w", err)
	}
	return nil
}

func (lock *InstanceLock) Close() error {
	lock.mu.Lock()
	defer lock.mu.Unlock()
	if lock.closed {
		return nil
	}
	lock.closed = true
	unlockErr := unlockFile(lock.file)
	closeErr := lock.file.Close()
	if unlockErr != nil {
		return fmt.Errorf("release kgosd.lock: %w", unlockErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close kgosd.lock: %w", closeErr)
	}
	return nil
}
