package runtime

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestRuntimeLocalEndpointAndClosedState(t *testing.T) {
	runtime := &Runtime{}
	if got := runtime.LocalEndpoint(9000); got != "http://127.0.0.1:9000" {
		t.Fatalf("local endpoint = %q", got)
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

func TestOpenRejectsInstanceRootThatIsAFile(t *testing.T) {
	root := t.TempDir() + "/instance-file"
	if err := os.WriteFile(root, []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("write Instance Root fixture: %v", err)
	}
	opened, err := OpenWithOfficialExtensions(
		context.Background(),
		root,
		[]runtimeprofile.ExtensionConfig{
			{Source: "/missing/lithograph", Entrypoint: runtimeprofile.LithographEntrypoint},
			{Source: "/missing/provider", Entrypoint: runtimeprofile.ProviderEntrypoint},
		},
		nil,
	)
	if opened != nil {
		_ = opened.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "create instance root") {
		t.Fatalf("file Instance Root error = %v", err)
	}
}
