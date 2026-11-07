package mcpserver

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// OAuth metadata and JWKS are attacker-chosen URLs. Production resolves and
// validates every returned address before connecting to the vetted IP. Even an
// explicitly configured HTTPS proxy CONNECTs to the pinned IP, never the
// untrusted hostname. A supplied OAuthClient is a trusted integration adapter.
func secureOAuthClient() *http.Client {
	return &http.Client{Transport: oauthSafeTransport{}, Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
}

type oauthSafeTransport struct {
	lookup       func(context.Context, string, string) ([]netip.Addr, error)
	proxyFor     func(*http.Request) (*url.URL, error)
	proxyTLSRoot *x509.CertPool // test-only CA injection for local HTTPS proxies
}

var errOAuthUnsafeDestination = errors.New("unsafe OAuth metadata destination")

func (t oauthSafeTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.Method != http.MethodGet || request.URL == nil ||
		request.URL.Scheme != "https" || request.URL.Host == "" ||
		request.URL.User != nil || request.URL.Fragment != "" {
		return nil, errOAuthUnsafeDestination
	}
	hostname := request.URL.Hostname()
	lookup := net.DefaultResolver.LookupNetIP
	if t.lookup != nil {
		lookup = t.lookup
	}
	addresses, err := lookup(request.Context(), "ip", hostname)
	if err != nil || len(addresses) == 0 {
		return nil, errors.New("OAuth metadata host resolution failed")
	}
	for _, address := range addresses {
		if !oauthPublicIP(address) {
			return nil, errOAuthUnsafeDestination
		}
	}
	// Resolve the trusted proxy from the original URL, but CONNECT only to the
	// validated IP. The TLS SNI/certificate and HTTP Host remain the original
	// public hostname, so a proxy cannot change the authenticated authority.
	proxyFor := http.ProxyFromEnvironment
	if t.proxyFor != nil {
		proxyFor = t.proxyFor
	}
	proxy, err := proxyFor(request)
	if err != nil {
		return nil, errors.New("invalid configured OAuth proxy")
	}
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			ServerName: hostname,
			MinVersion: tls.VersionTLS12,
		},
		ForceAttemptHTTP2:   true,
		DisableKeepAlives:   true,
		TLSHandshakeTimeout: 5 * time.Second,
	}
	if proxy != nil {
		if (proxy.Scheme != "http" && proxy.Scheme != "https") || proxy.Hostname() == "" {
			return nil, errors.New("unsupported configured OAuth proxy")
		}
		// Go's Transport applies TLSClientConfig.ServerName to both HTTPS
		// proxy and origin. Establish CONNECT explicitly so each TLS layer
		// verifies its own hostname, while only the validated IP is tunneled.
		transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
			if network != "tcp" {
				return nil, errors.New("unsupported OAuth proxy network")
			}
			return oauthDialProxyTunnel(ctx, proxy, address, t.proxyTLSRoot)
		}
	}
	defer transport.CloseIdleConnections()
	port := request.URL.Port()
	if port == "" {
		port = "443"
	}
	var lastErr error
	for _, address := range addresses {
		pinned := request.Clone(request.Context())
		target := *request.URL
		target.Host = net.JoinHostPort(address.String(), port)
		pinned.URL = &target
		// The URL's host is an IP only to pin the socket/CONNECT target.
		// HTTP Host must retain the original, verified Client metadata origin.
		pinned.Host = request.URL.Host
		response, err := transport.RoundTrip(pinned)
		if err == nil {
			return response, nil
		}
		lastErr = err
	}
	return nil, fmt.Errorf("fetch OAuth metadata: %w", lastErr)
}

type oauthBufferedConn struct {
	net.Conn
	reader *bufio.Reader
}

func (c *oauthBufferedConn) Read(p []byte) (int, error) { return c.reader.Read(p) }

// oauthDialProxyTunnel verifies an HTTPS proxy independently of the actual
// OAuth metadata origin. The CONNECT target is always a validated public IP,
// never the untrusted client-provided DNS name.
func oauthDialProxyTunnel(ctx context.Context, proxy *url.URL, target string, roots *x509.CertPool) (_ net.Conn, err error) {
	port := proxy.Port()
	if port == "" {
		if proxy.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	proxyAddress := net.JoinHostPort(proxy.Hostname(), port)
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	var conn net.Conn
	if proxy.Scheme == "https" {
		config := &tls.Config{ServerName: proxy.Hostname(), MinVersion: tls.VersionTLS12, RootCAs: roots}
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: config}).DialContext(ctx, "tcp", proxyAddress)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", proxyAddress)
	}
	if err != nil {
		return nil, fmt.Errorf("connect OAuth proxy: %w", err)
	}
	defer func() {
		if err != nil {
			_ = conn.Close()
		}
	}()
	deadline := time.Now().Add(5 * time.Second)
	if until, ok := ctx.Deadline(); ok && until.Before(deadline) {
		deadline = until
	}
	if err = conn.SetDeadline(deadline); err != nil {
		return nil, err
	}
	connect := &http.Request{Method: http.MethodConnect, URL: &url.URL{Opaque: target}, Host: target, Header: make(http.Header)}
	if proxy.User != nil {
		user := proxy.User.Username()
		pass, _ := proxy.User.Password()
		connect.Header.Set("Proxy-Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(user+":"+pass)))
	}
	if err = connect.Write(conn); err != nil {
		return nil, fmt.Errorf("write OAuth proxy CONNECT: %w", err)
	}
	reader := bufio.NewReader(conn)
	response, readErr := http.ReadResponse(reader, connect)
	if readErr != nil {
		err = fmt.Errorf("read OAuth proxy CONNECT: %w", readErr)
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		err = fmt.Errorf("OAuth proxy rejected CONNECT: HTTP %d", response.StatusCode)
		return nil, err
	}
	if err = conn.SetDeadline(time.Time{}); err != nil {
		return nil, err
	}
	return &oauthBufferedConn{Conn: conn, reader: reader}, nil
}

func oauthPublicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLoopback() {
		return false
	}
	for _, prefix := range oauthReservedPrefixes {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

var oauthReservedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2001:2::/48"),
}

func validOAuthPublicURL(raw string, requirePath bool) bool {
	if len(raw) == 0 || len(raw) > 2048 {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" ||
		parsed.RawQuery != "" || parsed.ForceQuery || parsed.Opaque != "" || parsed.RawPath != "" || parsed.String() != raw {
		return false
	}
	if requirePath && (parsed.Path == "" || parsed.Path == "/") {
		return false
	}
	for _, segment := range strings.Split(parsed.Path, "/") {
		if segment == "." || segment == ".." {
			return false
		}
	}
	if addr, err := netip.ParseAddr(parsed.Hostname()); err == nil {
		return oauthPublicIP(addr)
	}
	return parsed.Hostname() != "localhost"
}
