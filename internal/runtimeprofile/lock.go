package runtimeprofile

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"sync"
	"time"
)

var (
	ErrLocked         = errors.New("instance root is already owned by another kgosd")
	ErrNoActiveDaemon = errors.New("instance root has no active kgosd")
)

const daemonEndpointProbeTimeout = 250 * time.Millisecond

type InstanceLock struct {
	mu     sync.Mutex
	file   *os.File
	closed bool
}

type Locator struct {
	PID      int    `json:"pid"`
	Endpoint string `json:"endpoint,omitempty"`
	Version  string `json:"version"`
}

type DaemonState string

const (
	DaemonStopped     DaemonState = "stopped"
	DaemonStarting    DaemonState = "starting"
	DaemonRunning     DaemonState = "running"
	DaemonUnavailable DaemonState = "unavailable"
)

type DaemonStatus struct {
	State    DaemonState
	PID      int
	Endpoint string
	Version  string
	Err      error
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

func (lock *InstanceLock) PublishStarting(pid int, version string) error {
	if pid <= 0 || version == "" {
		return fmt.Errorf("daemon pid and version must be present")
	}
	return lock.publish(Locator{PID: pid, Version: version})
}

func (lock *InstanceLock) PublishRunning(pid int, endpoint, version string) error {
	if pid <= 0 || endpoint == "" || version == "" {
		return fmt.Errorf("daemon pid, endpoint, and version must be present")
	}
	if err := validateDaemonEndpoint(endpoint); err != nil {
		return err
	}
	return lock.publish(Locator{PID: pid, Endpoint: endpoint, Version: version})
}

func (lock *InstanceLock) publish(locator Locator) error {
	body, err := json.Marshal(locator)
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
	var locator Locator
	if err := decoder.Decode(&locator); err != nil {
		return "", fmt.Errorf("decode kgosd.lock: %w", err)
	}
	if locator.Endpoint == "" {
		return "", fmt.Errorf("kgosd.lock endpoint is empty")
	}
	return locator.Endpoint, nil
}

func ReadActiveEndpoint(path string) (string, error) {
	status := InspectDaemon(path)
	if status.State == DaemonRunning {
		return status.Endpoint, nil
	}
	if status.State == DaemonStopped {
		return "", ErrNoActiveDaemon
	}
	if status.Err != nil {
		return "", status.Err
	}
	return "", fmt.Errorf("kgosd is %s", status.State)
}

func InspectDaemon(path string) DaemonStatus {
	file, err := os.OpenFile(path, os.O_RDWR, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DaemonStatus{State: DaemonStopped}
		}
		return DaemonStatus{State: DaemonUnavailable, Err: fmt.Errorf("open kgosd.lock: %w", err)}
	}
	defer file.Close()
	if err := tryFileLock(file); err == nil {
		_ = unlockFile(file)
		return DaemonStatus{State: DaemonStopped}
	} else if !errors.Is(err, errFileLocked) {
		return DaemonStatus{
			State: DaemonUnavailable,
			Err:   fmt.Errorf("inspect kgosd.lock owner: %w", err),
		}
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return DaemonStatus{State: DaemonUnavailable, Err: fmt.Errorf("seek kgosd.lock: %w", err)}
	}
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var locator Locator
	if err := decoder.Decode(&locator); err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return DaemonStatus{State: DaemonStarting}
		}
		return DaemonStatus{
			State: DaemonUnavailable,
			Err:   fmt.Errorf("decode active kgosd.lock: %w", err),
		}
	}
	if locator.PID <= 0 || locator.Version == "" {
		return DaemonStatus{State: DaemonUnavailable, Err: fmt.Errorf("active kgosd.lock has invalid pid/version")}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return DaemonStatus{
			State: DaemonUnavailable,
			Err:   fmt.Errorf("active kgosd.lock must contain exactly one JSON object"),
		}
	}
	if locator.Endpoint == "" {
		return DaemonStatus{State: DaemonStarting, PID: locator.PID, Version: locator.Version}
	}
	if err := probeDaemonEndpoint(locator.Endpoint); err != nil {
		return DaemonStatus{
			State:    DaemonUnavailable,
			PID:      locator.PID,
			Endpoint: locator.Endpoint,
			Version:  locator.Version,
			Err:      err,
		}
	}
	return DaemonStatus{
		State: DaemonRunning, PID: locator.PID, Endpoint: locator.Endpoint, Version: locator.Version,
	}
}

func probeDaemonEndpoint(endpoint string) error {
	if err := validateDaemonEndpoint(endpoint); err != nil {
		return err
	}
	parsed, _ := url.Parse(endpoint)
	connection, err := net.DialTimeout("tcp4", parsed.Host, daemonEndpointProbeTimeout)
	if err != nil {
		return fmt.Errorf("connect active kgosd endpoint: %w", err)
	}
	return connection.Close()
}

func validateDaemonEndpoint(endpoint string) error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" ||
		parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") ||
		parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("active kgosd endpoint is invalid")
	}
	ip := net.ParseIP(parsed.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("active kgosd endpoint must use loopback")
	}
	return nil
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
