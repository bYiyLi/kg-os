package runtimeprofile

import (
	"encoding/hex"
	"fmt"
	"math"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

const (
	DefaultServerHost       = "127.0.0.1"
	DefaultServerPort       = 4765
	DefaultCacheMaxSizeMB   = int64(4096)
	DefaultFullTextAnalyzer = "unicode61"
	DefaultSimilarity       = "cosine"
)

type LookupEnv func(string) (string, bool)

type Config struct {
	Server    ServerConfig    `toml:"server"`
	Cache     CacheConfig     `toml:"cache"`
	SQLite    SQLiteConfig    `toml:"sqlite"`
	FullText  FullTextConfig  `toml:"fulltext"`
	Embedding EmbeddingConfig `toml:"embedding"`
}

type ServerConfig struct {
	Host string `toml:"host"`
	Port int    `toml:"port"`
}

type CacheConfig struct {
	Enabled   bool   `toml:"enabled"`
	Path      string `toml:"path"`
	MaxSizeMB int64  `toml:"max_size_mb"`
}

type SQLiteConfig struct {
	Extensions []ExtensionConfig `toml:"extensions"`
}

type ExtensionConfig struct {
	Source     string `toml:"source"`
	Library    string `toml:"library"`
	Entrypoint string `toml:"entrypoint"`
	SHA256     string `toml:"sha256"`
}

type FullTextConfig struct {
	Analyzer string `toml:"analyzer"`
}

type EmbeddingConfig struct {
	BaseURL    string `toml:"base_url"`
	Model      string `toml:"model"`
	Dimensions int    `toml:"dimensions"`
	Similarity string `toml:"similarity"`
	APIKeyEnv  string `toml:"api_key_env"`
}

type SemanticDefaults struct {
	Provider      string
	BaseURL       string
	Model         string
	APIKeyEnv     string
	Dimensions    int
	Similarity    string
	CacheEnabled  bool
	CachePath     string
	CacheMaxBytes int64
}

func LoadConfig(paths Paths, lookupEnv LookupEnv) (Config, error) {
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}

	config := Config{
		Server:    ServerConfig{Host: DefaultServerHost, Port: DefaultServerPort},
		Cache:     CacheConfig{Enabled: true, MaxSizeMB: DefaultCacheMaxSizeMB},
		FullText:  FullTextConfig{Analyzer: DefaultFullTextAnalyzer},
		Embedding: EmbeddingConfig{Similarity: DefaultSimilarity},
	}

	metadata, err := toml.DecodeFile(paths.Config, &config)
	if err != nil {
		return Config{}, fmt.Errorf("load config.toml: %w", err)
	}
	if undecoded := metadata.Undecoded(); len(undecoded) != 0 {
		return Config{}, fmt.Errorf("config.toml contains unknown field %q", undecoded[0].String())
	}

	if err := config.normalizeAndValidate(paths, lookupEnv); err != nil {
		return Config{}, err
	}
	return config, nil
}

func (config *Config) normalizeAndValidate(paths Paths, lookupEnv LookupEnv) error {
	if ip := net.ParseIP(config.Server.Host); ip == nil || ip.To4() == nil || strings.Contains(config.Server.Host, ":") {
		return fmt.Errorf("server.host must be an IPv4 address")
	}
	if config.Server.Port < 1 || config.Server.Port > 65535 {
		return fmt.Errorf("server.port must be between 1 and 65535")
	}

	if config.Cache.Path == "" {
		config.Cache.Path = filepath.Join(paths.CacheDir, "openai-compatible.db")
	} else if !filepath.IsAbs(config.Cache.Path) {
		config.Cache.Path = filepath.Join(paths.Home, config.Cache.Path)
	}
	absoluteCache, err := filepath.Abs(config.Cache.Path)
	if err != nil {
		return fmt.Errorf("resolve cache.path: %w", err)
	}
	config.Cache.Path = filepath.Clean(absoluteCache)
	if config.Cache.MaxSizeMB <= 0 {
		return fmt.Errorf("cache.max_size_mb must be a positive integer")
	}
	if config.Cache.MaxSizeMB > math.MaxInt64/(1024*1024) {
		return fmt.Errorf("cache.max_size_mb exceeds supported range")
	}
	if config.Cache.Enabled && samePath(config.Cache.Path, paths.Database) {
		return fmt.Errorf("cache.path must not point at kgos.db")
	}

	if len(config.SQLite.Extensions) == 0 {
		return fmt.Errorf("sqlite.extensions must contain at least one extension")
	}
	for index := range config.SQLite.Extensions {
		if err := validateExtensionConfig(&config.SQLite.Extensions[index]); err != nil {
			return fmt.Errorf("sqlite.extensions[%d]: %w", index, err)
		}
	}

	if strings.TrimSpace(config.FullText.Analyzer) == "" || strings.ContainsRune(config.FullText.Analyzer, 0) {
		return fmt.Errorf("fulltext.analyzer must be non-empty and contain no NUL")
	}

	if err := normalizeEmbedding(&config.Embedding, lookupEnv); err != nil {
		return err
	}
	return nil
}

func normalizeEmbedding(config *EmbeddingConfig, lookupEnv LookupEnv) error {
	parsed, err := url.Parse(config.BaseURL)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("embedding.base_url must be an absolute HTTP(S) URL")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("embedding.base_url must not contain query or fragment")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	config.BaseURL = parsed.String()
	if strings.TrimSpace(config.Model) == "" || strings.ContainsRune(config.Model, 0) {
		return fmt.Errorf("embedding.model must be non-empty and contain no NUL")
	}
	if config.Dimensions < 1 || config.Dimensions > 4096 {
		return fmt.Errorf("embedding.dimensions must be between 1 and 4096")
	}
	if config.Similarity != "cosine" && config.Similarity != "euclidean" {
		return fmt.Errorf("embedding.similarity must be cosine or euclidean")
	}
	if config.APIKeyEnv != "" {
		if strings.TrimSpace(config.APIKeyEnv) == "" || strings.ContainsRune(config.APIKeyEnv, 0) {
			return fmt.Errorf("embedding.api_key_env must be non-empty and contain no NUL")
		}
		value, ok := lookupEnv(config.APIKeyEnv)
		if !ok || value == "" {
			return fmt.Errorf("embedding.api_key_env %q is not set or empty", config.APIKeyEnv)
		}
	}
	return nil
}

func validateExtensionConfig(config *ExtensionConfig) error {
	_, _, err := validateAndClassifyExtensionConfig(config)
	return err
}

func validateAndClassifyExtensionConfig(
	config *ExtensionConfig,
) (remote bool, sourcePath string, err error) {
	if config.Source == "" || strings.ContainsRune(config.Source, 0) {
		return false, "", fmt.Errorf("source is required and must contain no NUL")
	}
	if config.Entrypoint == "" || strings.ContainsRune(config.Entrypoint, 0) {
		return false, "", fmt.Errorf("entrypoint is required and must contain no NUL")
	}

	remote, sourcePath, err = classifySource(config.Source)
	if err != nil {
		return false, "", err
	}
	archive := isArchivePath(sourcePath)
	if archive {
		if err := validateLibraryPath(config.Library); err != nil {
			return false, "", err
		}
	} else if config.Library != "" {
		return false, "", fmt.Errorf("library is only valid for .zip or .tar.gz sources")
	}

	if config.SHA256 != "" {
		if len(config.SHA256) != 64 || strings.ToLower(config.SHA256) != config.SHA256 {
			return false, "", fmt.Errorf("sha256 must be 64 lowercase hexadecimal characters")
		}
		if _, err := hex.DecodeString(config.SHA256); err != nil {
			return false, "", fmt.Errorf("sha256 must be 64 lowercase hexadecimal characters")
		}
	}
	if remote && config.SHA256 == "" {
		return false, "", fmt.Errorf("sha256 is required for HTTPS sources")
	}
	return remote, sourcePath, nil
}

func classifySource(source string) (remote bool, sourcePath string, err error) {
	parsed, parseErr := url.Parse(source)
	if parseErr == nil && parsed.IsAbs() {
		if parsed.Scheme != "https" || parsed.Host == "" {
			return false, "", fmt.Errorf("source URL must use https")
		}
		return true, parsed.Path, nil
	}
	if !filepath.IsAbs(source) {
		return false, "", fmt.Errorf("source must be an absolute local file path or absolute https URL")
	}
	return false, source, nil
}

func isArchivePath(path string) bool {
	lower := strings.ToLower(path)
	return strings.HasSuffix(lower, ".zip") || strings.HasSuffix(lower, ".tar.gz")
}

func validateLibraryPath(path string) error {
	if path == "" || strings.ContainsRune(path, 0) {
		return fmt.Errorf("library is required for archive sources")
	}
	if filepath.IsAbs(path) || strings.Contains(path, "\\") {
		return fmt.Errorf("library must be a safe relative archive path")
	}
	parts := strings.Split(path, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return fmt.Errorf("library must be a safe relative archive path")
		}
	}
	return nil
}

func (config Config) SemanticDefaults() SemanticDefaults {
	return SemanticDefaults{
		Provider:      "openai-compatible",
		BaseURL:       config.Embedding.BaseURL,
		Model:         config.Embedding.Model,
		APIKeyEnv:     config.Embedding.APIKeyEnv,
		Dimensions:    config.Embedding.Dimensions,
		Similarity:    config.Embedding.Similarity,
		CacheEnabled:  config.Cache.Enabled,
		CachePath:     config.Cache.Path,
		CacheMaxBytes: config.Cache.MaxSizeMB * 1024 * 1024,
	}
}

func samePath(left, right string) bool {
	leftAbs, leftErr := filepath.Abs(left)
	rightAbs, rightErr := filepath.Abs(right)
	if leftErr != nil || rightErr != nil {
		return false
	}
	return filepath.Clean(leftAbs) == filepath.Clean(rightAbs)
}
