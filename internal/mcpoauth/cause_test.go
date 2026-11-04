package mcpoauth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestCauseClassifiesLifecycleFailuresWithoutChangingSentinels(t *testing.T) {
	for _, cause := range []string{"not_found", "expired", "client_mismatch", "resource_mismatch", "auth_method_mismatch", "replay", "revoked"} {
		t.Run(cause, func(t *testing.T) {
			s, _ := openTestStore(t)
			ctx := context.Background()
			_, pair, b := issue(t, s, "diagnostic", "none", testNow)
			var err error
			switch cause {
			case "not_found":
				_, err = s.Rotate(ctx, digest("missing"), b.ClientID, testIssuer, tokenPair("next", "none", testNow), testNow)
			case "expired":
				later := testNow.Add(31 * 24 * time.Hour)
				_, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("next", "none", later), later)
			case "client_mismatch":
				_, err = s.Rotate(ctx, pair.RefreshHash, "wrong", testIssuer, tokenPair("next", "none", testNow), testNow)
			case "resource_mismatch":
				_, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, "https://wrong.example", tokenPair("next", "none", testNow), testNow)
			case "auth_method_mismatch":
				_, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("next", "private_key_jwt", testNow), testNow)
			case "replay":
				if _, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("next", "none", testNow), testNow); err != nil {
					t.Fatal(err)
				}
				_, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("again", "none", testNow), testNow)
			case "revoked":
				if _, err = s.Revoke(ctx, pair.RefreshHash, b.ClientID, "none", testNow); err != nil {
					t.Fatal(err)
				}
				_, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("next", "none", testNow), testNow)
			}
			if !errors.Is(err, ErrInvalidGrant) || Cause(err) != cause {
				t.Fatalf("cause=%q sentinel=%v error=%v", Cause(err), errors.Is(err, ErrInvalidGrant), err)
			}
			if Cause(fmt.Errorf("operation failed: %w", err)) != cause {
				t.Fatal("wrapped diagnostic lost")
			}
		})
	}
}

func TestCauseClassifiesCodeAndAccessFailures(t *testing.T) {
	for _, cause := range []string{"not_found", "expired", "client_mismatch", "resource_mismatch", "invalid_grant"} {
		t.Run(cause, func(t *testing.T) {
			s, _ := openTestStore(t)
			ctx := context.Background()
			code := testCode("code-cause", testNow)
			if err := s.PutCode(ctx, code, testNow); err != nil {
				t.Fatal(err)
			}
			hash, client, resource, challenge, now := code.Hash, code.Binding.ClientID, testIssuer, code.Challenge, testNow
			switch cause {
			case "not_found":
				hash = digest("missing")
			case "expired":
				now = now.Add(2 * time.Minute)
			case "client_mismatch":
				client = "wrong"
			case "resource_mismatch":
				resource = "https://wrong.example"
			case "invalid_grant":
				challenge = "wrong"
			}
			_, err := s.ExchangeCode(ctx, hash, client, code.RedirectURI, resource, challenge, tokenPair("next", "none", now), now)
			if !errors.Is(err, ErrInvalidGrant) || Cause(err) != cause {
				t.Fatalf("code diagnostic: %q %v", Cause(err), err)
			}
		})
	}
	s, _ := openTestStore(t)
	ctx := context.Background()
	_, pair, b := issue(t, s, "access-cause", "none", testNow)
	if _, err := s.ResolveAccess(ctx, digest("missing"), testNow); Cause(err) != "not_found" {
		t.Fatalf("access missing: %q", Cause(err))
	}
	if _, err := s.ResolveAccess(ctx, pair.AccessHash, testNow.Add(time.Hour)); Cause(err) != "expired" {
		t.Fatalf("access expiry: %q", Cause(err))
	}
	if _, err := s.Revoke(ctx, pair.RefreshHash, b.ClientID, "none", testNow); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ResolveAccess(ctx, pair.AccessHash, testNow); Cause(err) != "revoked" {
		t.Fatalf("access revoke: %q", Cause(err))
	}
	if _, err := s.CurrentRefresh(ctx, pair.RefreshHash, b.ClientID, testIssuer, testNow); Cause(err) != "revoked" {
		t.Fatalf("refresh revoke: %q", Cause(err))
	}
}

func TestCauseReturnsOnlyStaticCategories(t *testing.T) {
	secret := "raw-credential-never-a-log-reason"
	for _, tc := range []struct {
		err  error
		want string
	}{
		{nil, ""},
		{ErrLimit, "budget"},
		{ErrInvalidGrant, "invalid_grant"},
		{ErrInvalidToken, "invalid_grant"},
		{errors.New(secret), "backend"},
		{classify(secret, ErrInvalidGrant), "backend"},
		{classify("backend", errors.New(secret)), "backend"},
	} {
		got := Cause(tc.err)
		if got != tc.want || strings.Contains(got, secret) {
			t.Fatalf("unsafe cause: %q want %q", got, tc.want)
		}
	}
}
