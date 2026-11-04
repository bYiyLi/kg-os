package runtime

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
	"github.com/bYiyLi/kg-os/internal/mcpoauth"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type Runtime struct {
	Paths           runtimeprofile.Paths
	Config          runtimeprofile.Config
	Credential      runtimeprofile.Credential
	Extensions      []runtimeprofile.ResolvedExtension
	Database        *lithograph.Host
	Kernel          *kernel.Service
	OAuthStore      *mcpoauth.Store
	OAuthStoreError error

	lock   *runtimeprofile.InstanceLock
	closed bool
}

func Open(ctx context.Context, root string, client *http.Client) (_ *Runtime, returnErr error) {
	pkg, err := runtimeprofile.DiscoverRuntimePackage()
	if err != nil {
		return nil, err
	}
	if pkg.Version != buildinfo.Version {
		return nil, fmt.Errorf(
			"runtime package version %q does not match kgosd version %q",
			pkg.Version,
			buildinfo.Version,
		)
	}
	return OpenWithOfficialExtensions(ctx, root, pkg.OfficialExtensions(), client)
}

func OpenWithOfficialExtensions(
	ctx context.Context,
	root string,
	official []runtimeprofile.ExtensionConfig,
	client *http.Client,
) (_ *Runtime, returnErr error) {
	return openWithExtensions(ctx, root, official, client, nil)
}

// OpenWithHeldLock opens the Kernel under the listener's already-owned lock.
func OpenWithHeldLock(ctx context.Context, root string, held *runtimeprofile.InstanceLock, client *http.Client) (*Runtime, error) {
	if held == nil {
		return nil, fmt.Errorf("instance lock is required")
	}
	pkg, err := runtimeprofile.DiscoverRuntimePackage()
	if err != nil {
		return nil, err
	}
	if pkg.Version != buildinfo.Version {
		return nil, fmt.Errorf("runtime package version %q does not match kgosd version %q", pkg.Version, buildinfo.Version)
	}
	return openWithExtensions(ctx, root, pkg.OfficialExtensions(), client, held)
}

func openWithExtensions(ctx context.Context, root string, official []runtimeprofile.ExtensionConfig, client *http.Client, held *runtimeprofile.InstanceLock) (_ *Runtime, returnErr error) {
	if len(official) != 3 ||
		official[0].Entrypoint != runtimeprofile.LithographEntrypoint ||
		official[1].Entrypoint != runtimeprofile.ProviderEntrypoint ||
		official[2].Entrypoint != runtimeprofile.JiebaEntrypoint {
		return nil, fmt.Errorf("official runtime extensions must be Lithograph, Provider, then Jieba")
	}
	paths, err := runtimeprofile.ResolvePaths(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(paths.Root, 0o700); err != nil {
		return nil, fmt.Errorf("create instance root: %w", err)
	}
	lock := held
	if held == nil {
		lock, err = runtimeprofile.AcquireLock(paths.Lock)
		if err != nil {
			return nil, err
		}
		defer func() {
			if returnErr != nil {
				_ = lock.Close()
			}
		}()
		if err := lock.PublishStarting(os.Getpid(), buildinfo.Version); err != nil {
			return nil, fmt.Errorf("publish daemon starting locator: %w", err)
		}
	}
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		return nil, err
	}
	config, err := runtimeprofile.LoadConfig(paths)
	if err != nil {
		return nil, err
	}
	if err := runtimeprofile.ResolveWebEmbeddingKey(paths, config); err != nil {
		return nil, err
	}
	credential, err := runtimeprofile.LoadOrCreateCredential(paths)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(config.Cache.Path), 0o700); err != nil {
		return nil, fmt.Errorf("create Provider cache parent directory: %w", err)
	}
	configs := make([]runtimeprofile.ExtensionConfig, 0, len(official)+len(config.SQLite.Extensions))
	configs = append(configs, official[:2]...)
	configs = append(configs, config.SQLite.Extensions...)
	configs = append(configs, official[2])
	extensions, err := runtimeprofile.ResolveExtensions(ctx, paths, configs, client)
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
		lock:       nil,
	}
	runtime.OAuthStore, runtime.OAuthStoreError = openOAuthStore(paths, credential, config)
	if held == nil {
		runtime.lock = lock
	}
	return runtime, nil
}

func (runtime *Runtime) PublishEndpoint(endpoint string) error {
	if runtime.closed {
		return fmt.Errorf("runtime is closed")
	}
	return runtime.lock.PublishRunning(os.Getpid(), endpoint, buildinfo.Version)
}

func (runtime *Runtime) Endpoint() (string, error) {
	if runtime.closed {
		return "", fmt.Errorf("runtime is closed")
	}
	return runtime.lock.Endpoint()
}

func (runtime *Runtime) LocalEndpoint(port int) string {
	return "http://127.0.0.1:" + fmt.Sprint(port)
}

func (runtime *Runtime) Close() error {
	if runtime.closed {
		return nil
	}
	runtime.closed = true
	runtimeprofile.ReleaseWebEmbeddingKey(runtime.Paths)
	var failures []string
	if runtime.OAuthStore != nil {
		if err := runtime.OAuthStore.Close(); err != nil {
			failures = append(failures, "OAuth store: "+err.Error())
		}
	}
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
