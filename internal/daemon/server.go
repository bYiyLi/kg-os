package daemon

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"

	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func Serve(
	ctx context.Context,
	runtime *runtimehost.Runtime,
	handler http.Handler,
	output io.Writer,
) error {
	return ServeWithOptions(ctx, runtime, handler, output, ListenOptions{Host: "127.0.0.1"})
}

type ListenOptions struct {
	Host    string
	Port    int
	TLSCert string
	TLSKey  string
}

func ServeWithOptions(ctx context.Context, runtime *runtimehost.Runtime, handler http.Handler, output io.Writer, options ListenOptions) error {
	if options.Host == "" {
		options.Host = "127.0.0.1"
	}
	if options.Port < 0 || options.Port > 65535 {
		return fmt.Errorf("invalid TCP port")
	}
	if (options.TLSCert == "") != (options.TLSKey == "") {
		return fmt.Errorf("TLS cert and key must be provided together")
	}
	address := net.JoinHostPort(options.Host, strconv.Itoa(options.Port))
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", address, err)
	}
	defer listener.Close()

	secure := options.TLSCert != ""
	if secure {
		certificate, loadErr := tls.LoadX509KeyPair(options.TLSCert, options.TLSKey)
		if loadErr != nil {
			return fmt.Errorf("load daemon TLS credentials: %w", loadErr)
		}
		listener = tls.NewListener(listener, &tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{certificate},
		})
	}

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
	if secure {
		endpoint = "https://127.0.0.1:" + strconv.Itoa(tcpAddress.Port)
	}
	if err := runtime.PublishEndpoint(endpoint); err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = server.Shutdown(shutdownCtx)
		cancel()
		return fmt.Errorf("publish daemon endpoint: %w", err)
	}
	if output != nil {
		_, _ = fmt.Fprintf(output, "KG OS daemon: %s\n", endpoint)
		_, _ = fmt.Fprintf(output, "KG OS listen: %s://%s\n", map[bool]string{true: "https", false: "http"}[secure], address)
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
