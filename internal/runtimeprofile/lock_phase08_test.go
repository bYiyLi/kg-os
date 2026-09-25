package runtimeprofile

import (
	"errors"
	"os"
	"testing"
)

func TestPhase08ActiveLocatorInspectionFailures(t *testing.T) {
	paths := testProfilePaths(t)
	lock, err := AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()

	tests := []struct {
		name string
		body string
	}{
		{name: "unknown field", body: "{\"pid\":1,\"version\":\"0.0.0\",\"unknown\":true}\n"},
		{name: "invalid pid", body: "{\"pid\":0,\"version\":\"0.0.0\"}\n"},
		{name: "trailing object", body: "{\"pid\":1,\"version\":\"0.0.0\"}{\"extra\":true}\n"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			if err := lock.replace([]byte(test.body)); err != nil {
				t.Fatal(err)
			}
			status := InspectDaemon(paths.Lock)
			if status.State != DaemonUnavailable || status.Err == nil {
				t.Fatalf("status = %#v", status)
			}
			if _, err := ReadActiveEndpoint(paths.Lock); err == nil {
				t.Fatal("unavailable active locator returned an endpoint")
			}
		})
	}

	if err := lock.PublishRunning(1, "http://127.0.0.1:1", "0.0.0"); err != nil {
		t.Fatal(err)
	}
	status := InspectDaemon(paths.Lock)
	if status.State != DaemonUnavailable || status.Err == nil {
		t.Fatalf("unreachable endpoint status = %#v", status)
	}
	if _, err := ReadActiveEndpoint(paths.Lock); err == nil {
		t.Fatal("unreachable endpoint was returned as active")
	}
}

func TestPhase08ReadActiveEndpointStoppedAndStarting(t *testing.T) {
	paths := testProfilePaths(t)
	if _, err := ReadActiveEndpoint(paths.Lock); !errors.Is(err, ErrNoActiveDaemon) {
		t.Fatalf("stopped endpoint error = %v", err)
	}
	lock, err := AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	if err := lock.PublishStarting(os.Getpid(), "0.0.0"); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadActiveEndpoint(paths.Lock); err == nil {
		t.Fatal("starting daemon returned an active endpoint")
	}
}
