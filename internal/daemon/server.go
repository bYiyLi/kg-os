package daemon

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func Serve(
	ctx context.Context,
	runtime *runtimehost.Runtime,
	handler http.Handler,
	output io.Writer,
) error {
	address := fmt.Sprintf("%s:%d", runtime.Config.Server.Host, runtime.Config.Server.Port)
	listener, err := net.Listen("tcp4", address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", address, err)
	}
	defer listener.Close()

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		BaseContext: func(net.Listener) context.Context {
			return ctx
		},
	}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()

	tcpAddress, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("unexpected listener address %T", listener.Addr())
	}
	endpoint := runtime.LocalEndpoint(tcpAddress.Port)
	if err := runtime.PublishEndpoint(endpoint); err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = server.Shutdown(shutdownCtx)
		cancel()
		return fmt.Errorf("publish daemon endpoint: %w", err)
	}
	if output != nil {
		_, _ = fmt.Fprintf(output, "KG OS daemon: %s\n", endpoint)
	}

	select {
	case serveErr := <-serverErrors:
		if errors.Is(serveErr, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve KG OS daemon: %w", serveErr)
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		shutdownErr := server.Shutdown(shutdownCtx)
		cancel()
		if shutdownErr != nil {
			_ = server.Close()
			return fmt.Errorf("shutdown KG OS daemon: %w", shutdownErr)
		}
		serveErr := <-serverErrors
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			return fmt.Errorf("serve KG OS daemon: %w", serveErr)
		}
		return nil
	}
}
