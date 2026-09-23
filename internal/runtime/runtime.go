package runtime

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type Runtime struct {
	Paths      runtimeprofile.Paths
	Config     runtimeprofile.Config
	Credential runtimeprofile.Credential
	Extensions []runtimeprofile.ResolvedExtension
	Database   *lithograph.Host
	Kernel     *kernel.Service

	lock   *runtimeprofile.InstanceLock
	closed bool
}

func Open(ctx context.Context, explicitHome string, client *http.Client) (_ *Runtime, returnErr error) {
	paths, err := runtimeprofile.ResolvePaths(explicitHome)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(paths.Home, 0o700); err != nil {
		return nil, fmt.Errorf("create KG_HOME: %w", err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		return nil, err
	}
	defer func() {
		if returnErr != nil {
			_ = lock.Close()
		}
	}()
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		return nil, err
	}
	config, err := runtimeprofile.LoadConfig(paths, nil)
	if err != nil {
		return nil, err
	}
	credential, err := runtimeprofile.LoadOrCreateCredential(paths)
	if err != nil {
		return nil, err
	}
	if config.Cache.Enabled {
		if err := os.MkdirAll(filepath.Dir(config.Cache.Path), 0o700); err != nil {
			return nil, fmt.Errorf("create Provider cache parent directory: %w", err)
		}
	}
	extensions, err := runtimeprofile.ResolveExtensions(ctx, paths, config.SQLite.Extensions, client)
	if err != nil {
		return nil, err
	}
	database, err := lithograph.Open(
		ctx,
		paths.Database,
		extensions,
		config.FullText.Analyzer,
		config.SemanticDefaults(),
	)
	if err != nil {
		return nil, err
	}
	kernelService, err := kernel.Open(
		ctx,
		database,
		config.FullText.Analyzer,
		config.SemanticDefaults(),
	)
	if err != nil {
		_ = database.Close()
		return nil, err
	}
	runtime := &Runtime{
		Paths:      paths,
		Config:     config,
		Credential: credential,
		Extensions: extensions,
		Database:   database,
		Kernel:     kernelService,
		lock:       lock,
	}
	return runtime, nil
}

func (runtime *Runtime) PublishEndpoint(endpoint string) error {
	if runtime.closed {
		return fmt.Errorf("runtime is closed")
	}
	return runtime.lock.PublishEndpoint(endpoint)
}

func (runtime *Runtime) Endpoint() (string, error) {
	if runtime.closed {
		return "", fmt.Errorf("runtime is closed")
	}
	return runtime.lock.Endpoint()
}

func (runtime *Runtime) LocalEndpoint(port int) string {
	host := runtime.Config.Server.Host
	if host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	return "http://" + host + ":" + fmt.Sprint(port)
}

func (runtime *Runtime) Close() error {
	if runtime.closed {
		return nil
	}
	runtime.closed = true
	var failures []string
	if runtime.Database != nil {
		if err := runtime.Database.Close(); err != nil {
			failures = append(failures, "database: "+err.Error())
		}
	}
	if runtime.lock != nil {
		if err := runtime.lock.Close(); err != nil {
			failures = append(failures, "lock: "+err.Error())
		}
	}
	if len(failures) != 0 {
		return fmt.Errorf("close runtime: %s", strings.Join(failures, "; "))
	}
	return nil
}
