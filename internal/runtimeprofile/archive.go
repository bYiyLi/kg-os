package runtimeprofile

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func extractZip(body []byte, root string, limits ResolverLimits) error {
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return fmt.Errorf("open extension zip archive: %w", err)
	}
	if len(reader.File) > limits.MaxArchiveEntries {
		return fmt.Errorf("extension archive exceeds %d entries", limits.MaxArchiveEntries)
	}
	var extracted int64
	seen := make(map[string]struct{}, len(reader.File))
	for _, file := range reader.File {
		name, err := validateArchiveEntry(file.Name)
		if err != nil {
			return err
		}
		if _, exists := seen[name]; exists {
			return fmt.Errorf("extension archive contains duplicate path %q", name)
		}
		seen[name] = struct{}{}
		info := file.FileInfo()
		if info.IsDir() {
			if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(name)), 0o700); err != nil {
				return fmt.Errorf("create extension archive directory: %w", err)
			}
			continue
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("extension archive contains non-regular entry %q", name)
		}
		if file.UncompressedSize64 > uint64(limits.MaxFileBytes) {
			return fmt.Errorf("extension archive entry %q exceeds file limit", name)
		}
		extracted += int64(file.UncompressedSize64)
		if extracted > limits.MaxExtractBytes {
			return fmt.Errorf("extension archive exceeds extracted-size limit")
		}
		stream, err := file.Open()
		if err != nil {
			return fmt.Errorf("open extension archive entry %q: %w", name, err)
		}
		writeErr := writeArchiveStream(root, name, stream, limits.MaxFileBytes)
		closeErr := stream.Close()
		if writeErr != nil {
			return writeErr
		}
		if closeErr != nil {
			return fmt.Errorf("close extension archive entry %q: %w", name, closeErr)
		}
	}
	return nil
}

func extractTarGz(body []byte, root string, limits ResolverLimits) error {
	gzipReader, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("open extension tar.gz archive: %w", err)
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	seen := make(map[string]struct{})
	entries := 0
	var extracted int64
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read extension tar.gz archive: %w", err)
		}
		entries++
		if entries > limits.MaxArchiveEntries {
			return fmt.Errorf("extension archive exceeds %d entries", limits.MaxArchiveEntries)
		}
		name, err := validateArchiveEntry(header.Name)
		if err != nil {
			return err
		}
		if _, exists := seen[name]; exists {
			return fmt.Errorf("extension archive contains duplicate path %q", name)
		}
		seen[name] = struct{}{}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(name)), 0o700); err != nil {
				return fmt.Errorf("create extension archive directory: %w", err)
			}
		case tar.TypeReg, byte(0):
			if header.Size < 0 || header.Size > limits.MaxFileBytes {
				return fmt.Errorf("extension archive entry %q exceeds file limit", name)
			}
			extracted += header.Size
			if extracted > limits.MaxExtractBytes {
				return fmt.Errorf("extension archive exceeds extracted-size limit")
			}
			if err := writeArchiveStream(root, name, reader, limits.MaxFileBytes); err != nil {
				return err
			}
		default:
			return fmt.Errorf("extension archive contains unsupported entry %q", name)
		}
	}
	return nil
}

func validateArchiveEntry(name string) (string, error) {
	if name == "" || strings.ContainsRune(name, 0) || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("extension archive contains unsafe path %q", name)
	}
	trimmed := strings.TrimSuffix(name, "/")
	if trimmed == "" {
		return "", fmt.Errorf("extension archive contains unsafe path %q", name)
	}
	parts := strings.Split(trimmed, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", fmt.Errorf("extension archive contains unsafe path %q", name)
		}
	}
	return strings.Join(parts, "/"), nil
}

func writeArchiveStream(root, name string, source io.Reader, limit int64) error {
	path := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create extension archive parent directory: %w", err)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create extension archive entry %q: %w", name, err)
	}
	closed := false
	defer func() {
		if !closed {
			_ = file.Close()
		}
	}()
	written, err := io.Copy(file, io.LimitReader(source, limit+1))
	if err != nil {
		return fmt.Errorf("extract extension archive entry %q: %w", name, err)
	}
	if written > limit {
		return fmt.Errorf("extension archive entry %q exceeds file limit", name)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync extension archive entry %q: %w", name, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close extension archive entry %q: %w", name, err)
	}
	closed = true
	return nil
}
