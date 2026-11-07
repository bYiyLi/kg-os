package mcpserver

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"sync"
	"time"

	jose "github.com/go-jose/go-jose/v4"
)

const (
	oauthJWKSCacheLimit    = 256
	oauthJWKSMaxBytes      = 64 << 10
	oauthJWKSMaxKeys       = 64
	oauthJWKSProbeCooldown = 30 * time.Second
)

func validOAuthJWKSURI(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" ||
		parsed.Opaque != "" || parsed.String() != raw {
		return false
	}
	return validOAuthClientURI(raw)
}

type oauthJWKSCacheEntry struct {
	keys                   map[string]*rsa.PublicKey
	freshUntil, staleUntil time.Time
}

type oauthJWKSFlight struct {
	done chan struct{}
	err  error
}

type oauthJWKSResolver struct {
	client    *http.Client
	now       func() time.Time
	mu        sync.Mutex
	entries   map[string]oauthJWKSCacheEntry
	flights   map[string]*oauthJWKSFlight
	nextFetch map[string]time.Time
}

func newOAuthJWKSResolver(client *http.Client, now func() time.Time) *oauthJWKSResolver {
	return &oauthJWKSResolver{client: client, now: now, entries: make(map[string]oauthJWKSCacheEntry), flights: make(map[string]*oauthJWKSFlight), nextFetch: make(map[string]time.Time)}
}

func (r *oauthJWKSResolver) Key(ctx context.Context, uri, kid string) (*rsa.PublicKey, error) {
	if !validOAuthJWKSURI(uri) || kid == "" || len(kid) > 128 {
		return nil, errOAuthInvalidClient
	}
	r.mu.Lock()
	entry, cached := r.entries[uri]
	if cached && entry.freshUntil.After(r.now()) && entry.keys[kid] != nil {
		r.mu.Unlock()
		return entry.keys[kid], nil
	}
	if flight := r.flights[uri]; flight != nil {
		r.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, errOAuthClientUnavailable
		case <-flight.done:
			return r.currentKey(uri, kid, flight.err)
		}
	}
	now := r.now()
	for name, until := range r.nextFetch {
		if !until.After(now) {
			delete(r.nextFetch, name)
		}
	}
	if r.nextFetch[uri].After(now) {
		r.mu.Unlock()
		return r.currentKey(uri, kid, errOAuthClientUnavailable)
	}
	if len(r.nextFetch) >= oauthJWKSCacheLimit {
		r.mu.Unlock()
		return r.currentKey(uri, kid, errOAuthClientUnavailable)
	}
	if len(r.flights) >= oauthClientFetchLimit {
		r.mu.Unlock()
		return r.currentKey(uri, kid, errOAuthClientUnavailable)
	}
	flight := &oauthJWKSFlight{done: make(chan struct{})}
	r.flights[uri] = flight
	// One forced key-rotation probe per URI/window. In particular, random
	// unknown kids cannot turn a fresh cache into unbounded outbound traffic.
	// This retry throttle never extends a key's validated freshness/lifetime.
	r.nextFetch[uri] = now.Add(oauthJWKSProbeCooldown)
	r.mu.Unlock()
	keys, err := r.fetch(ctx, uri)
	r.mu.Lock()
	if err == nil {
		now := r.now()
		for name, item := range r.entries {
			if !item.staleUntil.After(now) {
				delete(r.entries, name)
			}
		}
		if len(r.entries) >= oauthJWKSCacheLimit {
			var oldestURI string
			var oldest time.Time
			for name, item := range r.entries {
				if oldestURI == "" || item.staleUntil.Before(oldest) {
					oldestURI, oldest = name, item.staleUntil
				}
			}
			delete(r.entries, oldestURI)
		}
		r.entries[uri] = oauthJWKSCacheEntry{keys: keys, freshUntil: now.Add(oauthClientFreshTTL), staleUntil: now.Add(oauthClientStaleTTL)}
	} else if !errors.Is(err, errOAuthClientUnavailable) {
		delete(r.entries, uri)
	}
	flight.err = err
	delete(r.flights, uri)
	close(flight.done)
	r.mu.Unlock()
	return r.currentKey(uri, kid, err)
}

func (r *oauthJWKSResolver) currentKey(uri, kid string, fetchErr error) (*rsa.PublicKey, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, ok := r.entries[uri]
	now := r.now()
	if ok && (entry.freshUntil.After(now) || (errors.Is(fetchErr, errOAuthClientUnavailable) && entry.staleUntil.After(now))) {
		if key := entry.keys[kid]; key != nil {
			return key, nil
		}
		if fetchErr == nil {
			return nil, errOAuthInvalidClient
		}
	}
	if fetchErr == nil {
		fetchErr = errOAuthClientUnavailable
	}
	return nil, fetchErr
}

func (r *oauthJWKSResolver) fetch(ctx context.Context, uri string) (map[string]*rsa.PublicKey, error) {
	data, err := fetchOAuthJSON(ctx, r.client, uri, oauthJWKSMaxBytes)
	if err != nil {
		return nil, err
	}
	var set jose.JSONWebKeySet
	if json.Unmarshal(data, &set) != nil || len(set.Keys) == 0 || len(set.Keys) > oauthJWKSMaxKeys {
		return nil, errOAuthInvalidClient
	}
	keys := make(map[string]*rsa.PublicKey)
	for _, item := range set.Keys {
		if item.KeyID == "" || len(item.KeyID) > 128 {
			return nil, errOAuthInvalidClient
		}
		if item.Use != "" && item.Use != "sig" {
			continue
		}
		if item.Algorithm != "" && item.Algorithm != string(jose.RS256) {
			continue
		}
		key, ok := item.Key.(*rsa.PublicKey)
		if !ok {
			continue
		}
		if key.N == nil || key.N.BitLen() < 2048 || key.N.BitLen() > 8192 || key.E < 3 || key.E%2 == 0 {
			return nil, errOAuthInvalidClient
		}
		if keys[item.KeyID] != nil {
			return nil, errOAuthInvalidClient
		}
		keys[item.KeyID] = key
	}
	if len(keys) == 0 {
		return nil, errOAuthInvalidClient
	}
	return keys, nil
}
