package runtime

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestRuntimeLocalEndpointAndClosedState(t *testing.T) {
	runtime := &Runtime{
		Config: runtimeprofile.Config{
			Server: runtimeprofile.ServerConfig{Host: "0.0.0.0"},
		},
	}
	if got := runtime.LocalEndpoint(9000); got != "http://127.0.0.1:9000" {
		t.Fatalf("wildcard local endpoint = %q", got)
	}
	runtime.Config.Server.Host = "192.0.2.10"
	if got := runtime.LocalEndpoint(9001); got != "http://192.0.2.10:9001" {
		t.Fatalf("specific local endpoint = %q", got)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close empty runtime: %v", err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close empty runtime twice: %v", err)
	}
	if _, err := runtime.Endpoint(); err == nil || !strings.Contains(err.Error(), "closed") {
		t.Fatalf("closed Endpoint error = %v", err)
	}
	if err := runtime.PublishEndpoint("http://127.0.0.1:9000"); err == nil ||
		!strings.Contains(err.Error(), "closed") {
		t.Fatalf("closed PublishEndpoint error = %v", err)
	}
}

func TestOpenRejectsKGHomeThatIsAFile(t *testing.T) {
	home := t.TempDir() + "/profile-file"
	if err := os.WriteFile(home, []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("write KG_HOME fixture: %v", err)
	}
	opened, err := Open(context.Background(), home, nil)
	if opened != nil {
		_ = opened.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "create KG_HOME") {
		t.Fatalf("file KG_HOME error = %v", err)
	}
}
