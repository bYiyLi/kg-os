package runtimeprofile

import "testing"

func TestNormalizePublicOrigin(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"https://kgos.example.com", "https://kgos.example.com"},
		{"https://kgos.example.com/", "https://kgos.example.com"},
		{"https://kgos.example.com:8443", "https://kgos.example.com:8443"},
		{"http://localhost:5184", "http://localhost:5184"},
		{"http://127.0.0.1:5184", "http://127.0.0.1:5184"},
		{"http://[::1]:5184", "http://[::1]:5184"},
	} {
		got, err := NormalizePublicOrigin(tc.input)
		if err != nil || got != tc.want {
			t.Fatalf("%q normalized to %q, %v", tc.input, got, err)
		}
	}
	for _, invalid := range []string{
		"", "kgos.example.com", "ftp://kgos.example.com", "http://kgos.example.com",
		"http://10.0.0.1", "https://user@kgos.example.com", "https://kgos.example.com/mcp",
		"https://kgos.example.com/?key=x", "https://kgos.example.com/#frag",
		"https://kgos.example.com/?", "https://kgos.example.com/#",
		"https://kgos.example.com/oauth/authorize", "https://kgos.example.com:invalid",
	} {
		if value, err := NormalizePublicOrigin(invalid); err == nil {
			t.Fatalf("accepted invalid public origin %q as %q", invalid, value)
		}
	}
}

func TestConfigAcceptsLegacyWithoutServerButValidatesNewServer(t *testing.T) {
	paths := testProfilePaths(t)
	legacy := completeRuntimeConfig("", "")
	if config, err := ParseConfig(paths, []byte(legacy)); err != nil || config.Server != nil {
		t.Fatalf("legacy config must remain loadable without OAuth: %#v, %v", config.Server, err)
	}
	withOrigin := "[server]\npublic_origin = \"https://kgos.example.com\"\n\n" + legacy
	if config, err := ParseConfig(paths, []byte(withOrigin)); err != nil || config.Server == nil || config.Server.PublicOrigin != "https://kgos.example.com" {
		t.Fatalf("new server origin failed to load: %#v, %v", config.Server, err)
	}
	for _, invalid := range []string{
		"[server]\n\n" + legacy,
		"[server]\npublic_origin = \"http://public.example.com\"\n\n" + legacy,
	} {
		if _, err := ParseConfig(paths, []byte(invalid)); err == nil {
			t.Fatal("accepted invalid server configuration")
		}
	}
}
