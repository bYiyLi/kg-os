package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type optionalInstallValue struct {
	value string
	set   bool
}

type installCLI struct {
	serverHost          optionalInstallValue
	serverPort          optionalInstallValue
	cachePath           optionalInstallValue
	cacheMaxSizeMB      optionalInstallValue
	fulltextAnalyzer    optionalInstallValue
	embeddingBaseURL    optionalInstallValue
	embeddingModel      optionalInstallValue
	embeddingDimensions optionalInstallValue
	embeddingSimilarity optionalInstallValue
	embeddingAPIKeyEnv  optionalInstallValue
}

type installResult struct {
	Status string `json:"status"`
	Home   string `json:"home"`
}

const codeInstallConfigurationIncomplete kernel.ErrorCode = "INSTALL_CONFIGURATION_INCOMPLETE"

func runInstall(
	args []string,
	stdin io.Reader,
	interactive bool,
	stdout,
	stderr io.Writer,
) int {
	locale := detectLocale()
	if hasHelp(args) {
		_, _ = io.WriteString(stdout, installHelp(locale))
		return 0
	}
	input, err := parseInstallCLI(args)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	paths, err := runtimeprofile.ResolvePaths(os.Getenv("KG_HOME"))
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "resolve KG_HOME failed", 2)
	}

	if _, err := os.Stat(paths.Config); err == nil {
		if input.anySet() {
			return writeLocalCLIError(
				stderr,
				kernel.CodeInvalidArgument,
				"config.toml already exists; configuration flags are not accepted",
				2,
			)
		}
		body, err := os.ReadFile(paths.Config)
		if err != nil {
			return writeLocalCLIError(stderr, kernel.CodeIO, "read existing config.toml failed", 2)
		}
		if _, err := runtimeprofile.ParseConfig(paths, body); err != nil {
			return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
		}
		return writeInstallResult(stdout, installResult{Status: "already_installed", Home: paths.Home})
	} else if !errors.Is(err, os.ErrNotExist) {
		return writeLocalCLIError(stderr, kernel.CodeIO, "inspect config.toml failed", 2)
	}

	if input.anySet() {
		if err := validateSuppliedInstallValues(paths, input); err != nil {
			return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
		}
	}

	missing := input.missingKeys()
	usedPrompt := false
	warningShown := false
	if len(missing) != 0 && !interactive {
		return writeLocalCLIErrorDetails(
			stderr,
			codeInstallConfigurationIncomplete,
			"installation configuration is incomplete",
			map[string]any{"missing": missing},
			2,
		)
	}
	if len(missing) != 0 {
		reader := bufio.NewReader(stdin)
		for _, field := range installFields() {
			target := field.value(&input)
			if target.set {
				continue
			}
			if field.initialization && !warningShown {
				_, _ = io.WriteString(stdout, initializationWarning(locale))
				warningShown = true
			}
			value, err := readInstallPrompt(reader, stdout, locale, field.key, field.recommended)
			if err != nil {
				return writeLocalCLIError(stderr, kernel.CodeIO, "read installation input failed", 2)
			}
			target.value = value
			target.set = true
			usedPrompt = true
		}
	}

	distribution, err := discoverDistribution()
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "validate KG OS distribution failed: "+err.Error(), 2)
	}
	config, err := input.config(distribution)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	body, err := encodeInstallConfig(config)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "encode config.toml failed", 2)
	}
	if _, err := runtimeprofile.ParseConfig(paths, body); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "create KG_HOME failed", 2)
	}
	if err := writeConfigAtomic(paths.Config, body); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "publish config.toml failed", 2)
	}
	if usedPrompt {
		_, _ = io.WriteString(stdout, installSuccess(locale, paths.Home))
		return 0
	}
	return writeInstallResult(stdout, installResult{Status: "installed", Home: paths.Home})
}

func validateSuppliedInstallValues(paths runtimeprofile.Paths, input installCLI) error {
	candidate := input
	for _, field := range installFields() {
		target := field.value(&candidate)
		if !target.set {
			target.value = field.recommended
			target.set = true
		}
	}
	validationDistribution := runtimeprofile.Distribution{
		Lithograph: filepath.Join(paths.Home, ".kgos-install-validation-lithograph"),
		Provider:   filepath.Join(paths.Home, ".kgos-install-validation-provider"),
	}
	config, err := candidate.config(validationDistribution)
	if err != nil {
		return err
	}
	body, err := encodeInstallConfig(config)
	if err != nil {
		return fmt.Errorf("encode installation configuration: %w", err)
	}
	_, err = runtimeprofile.ParseConfig(paths, body)
	return err
}

type installField struct {
	key            string
	recommended    string
	initialization bool
	value          func(*installCLI) *optionalInstallValue
}

func installFields() []installField {
	return []installField{
		{"server.host", runtimeprofile.RecommendedServerHost, false, func(input *installCLI) *optionalInstallValue { return &input.serverHost }},
		{"server.port", strconv.Itoa(runtimeprofile.RecommendedServerPort), false, func(input *installCLI) *optionalInstallValue { return &input.serverPort }},
		{"cache.path", runtimeprofile.RecommendedCachePath, false, func(input *installCLI) *optionalInstallValue { return &input.cachePath }},
		{"cache.max_size_mb", strconv.FormatInt(runtimeprofile.RecommendedCacheMaxSizeMB, 10), false, func(input *installCLI) *optionalInstallValue { return &input.cacheMaxSizeMB }},
		{"fulltext.analyzer", runtimeprofile.RecommendedFullTextAnalyzer, true, func(input *installCLI) *optionalInstallValue { return &input.fulltextAnalyzer }},
		{"embedding.base_url", runtimeprofile.RecommendedEmbeddingBaseURL, true, func(input *installCLI) *optionalInstallValue { return &input.embeddingBaseURL }},
		{"embedding.model", runtimeprofile.RecommendedEmbeddingModel, true, func(input *installCLI) *optionalInstallValue { return &input.embeddingModel }},
		{"embedding.dimensions", strconv.Itoa(runtimeprofile.RecommendedDimensions), true, func(input *installCLI) *optionalInstallValue { return &input.embeddingDimensions }},
		{"embedding.similarity", runtimeprofile.RecommendedSimilarity, true, func(input *installCLI) *optionalInstallValue { return &input.embeddingSimilarity }},
		{"embedding.api_key_env", runtimeprofile.RecommendedAPIKeyEnv, true, func(input *installCLI) *optionalInstallValue { return &input.embeddingAPIKeyEnv }},
	}
}

func parseInstallCLI(args []string) (installCLI, error) {
	var input installCLI
	for index := 0; index < len(args); index++ {
		arg := args[index]
		var target *optionalInstallValue
		switch arg {
		case "--server-host":
			target = &input.serverHost
		case "--server-port":
			target = &input.serverPort
		case "--cache-path":
			target = &input.cachePath
		case "--cache-max-size-mb":
			target = &input.cacheMaxSizeMB
		case "--fulltext-analyzer":
			target = &input.fulltextAnalyzer
		case "--embedding-base-url":
			target = &input.embeddingBaseURL
		case "--embedding-model":
			target = &input.embeddingModel
		case "--embedding-dimensions":
			target = &input.embeddingDimensions
		case "--embedding-similarity":
			target = &input.embeddingSimilarity
		case "--embedding-api-key-env":
			target = &input.embeddingAPIKeyEnv
		default:
			return input, fmt.Errorf("unknown install option %q", arg)
		}
		if target.set {
			return input, fmt.Errorf("%s may be provided only once", arg)
		}
		if index+1 >= len(args) || strings.HasPrefix(args[index+1], "--") {
			return input, fmt.Errorf("%s requires a value", arg)
		}
		index++
		target.value = args[index]
		target.set = true
	}
	return input, nil
}

func (input installCLI) anySet() bool {
	for _, field := range installFields() {
		if field.value(&input).set {
			return true
		}
	}
	return false
}

func (input installCLI) missingKeys() []string {
	missing := make([]string, 0, len(installFields()))
	for _, field := range installFields() {
		if !field.value(&input).set {
			missing = append(missing, field.key)
		}
	}
	sort.Strings(missing)
	return missing
}

func (input installCLI) config(distribution runtimeprofile.Distribution) (runtimeprofile.Config, error) {
	serverPort, err := strconv.Atoi(input.serverPort.value)
	if err != nil {
		return runtimeprofile.Config{}, fmt.Errorf("server.port must be an integer")
	}
	cacheMaxSize, err := strconv.ParseInt(input.cacheMaxSizeMB.value, 10, 64)
	if err != nil {
		return runtimeprofile.Config{}, fmt.Errorf("cache.max_size_mb must be an integer")
	}
	dimensions, err := strconv.Atoi(input.embeddingDimensions.value)
	if err != nil {
		return runtimeprofile.Config{}, fmt.Errorf("embedding.dimensions must be an integer")
	}
	return runtimeprofile.Config{
		Server: runtimeprofile.ServerConfig{Host: input.serverHost.value, Port: serverPort},
		Cache: runtimeprofile.CacheConfig{
			Path:      input.cachePath.value,
			MaxSizeMB: cacheMaxSize,
		},
		SQLite: runtimeprofile.SQLiteConfig{Extensions: []runtimeprofile.ExtensionConfig{
			{
				Source:     distribution.Lithograph,
				Entrypoint: runtimeprofile.LithographEntrypoint,
				SHA256:     distribution.LithographSHA256,
			},
			{
				Source:     distribution.Provider,
				Entrypoint: runtimeprofile.ProviderEntrypoint,
				SHA256:     distribution.ProviderSHA256,
			},
		}},
		FullText: runtimeprofile.FullTextConfig{Analyzer: input.fulltextAnalyzer.value},
		Embedding: runtimeprofile.EmbeddingConfig{
			BaseURL:    input.embeddingBaseURL.value,
			Model:      input.embeddingModel.value,
			Dimensions: dimensions,
			Similarity: input.embeddingSimilarity.value,
			APIKeyEnv:  input.embeddingAPIKeyEnv.value,
		},
	}, nil
}

func encodeInstallConfig(config runtimeprofile.Config) ([]byte, error) {
	var body bytes.Buffer
	if err := toml.NewEncoder(&body).Encode(config); err != nil {
		return nil, err
	}
	return body.Bytes(), nil
}

func readInstallPrompt(
	reader *bufio.Reader,
	stdout io.Writer,
	locale cliLocale,
	key,
	recommended string,
) (string, error) {
	_, _ = io.WriteString(stdout, installPrompt(locale, key, recommended))
	line, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	if errors.Is(err, io.EOF) && line == "" {
		return "", io.ErrUnexpectedEOF
	}
	value := strings.TrimSpace(line)
	if value == "" {
		return recommended, nil
	}
	if key == "embedding.api_key_env" && value == "\"\"" {
		return "", nil
	}
	return value, nil
}

func writeConfigAtomic(path string, body []byte) error {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".config-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	published := false
	defer func() {
		_ = temporary.Close()
		if !published {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return err
	}
	if _, err := temporary.Write(body); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Link(temporaryPath, path); err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("config.toml appeared while installing")
		}
		return err
	}
	published = true
	_ = os.Remove(temporaryPath)
	directoryHandle, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer directoryHandle.Close()
	return directoryHandle.Sync()
}

func writeInstallResult(stdout io.Writer, result installResult) int {
	body, err := json.Marshal(result)
	if err == nil {
		_, _ = stdout.Write(append(body, '\n'))
	}
	return 0
}

func writeLocalCLIErrorDetails(
	stderr io.Writer,
	code kernel.ErrorCode,
	message string,
	details map[string]any,
	exit int,
) int {
	return writePublicCLIError(stderr, &kernel.PublicError{Code: code, Message: message, Details: details}, exit)
}
