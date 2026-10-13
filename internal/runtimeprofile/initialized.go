package runtimeprofile

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const initializationVersion = 1

// InitializationComplete implements the existing CLI receipt format.
func InitializationComplete(paths Paths) (bool, error) {
	file, err := os.Open(filepath.Join(paths.Root, "initialized.json"))
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read initialization receipt: %w", err)
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 4096))
	decoder.DisallowUnknownFields()
	var marker struct {
		Version int `json:"version"`
	}
	if err := decoder.Decode(&marker); err != nil {
		return false, fmt.Errorf("invalid initialization receipt: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return false, errors.New("invalid initialization receipt trailing content")
	}
	if marker.Version != initializationVersion {
		return false, errors.New("unsupported initialization receipt version")
	}
	return true, nil
}

// PublishInitializationReceipt requires prior authenticated HTTP readiness.
// A crash before publication leaves an Instance that explicit init can resume.
func PublishInitializationReceipt(paths Paths) error {
	complete, err := InitializationComplete(paths)
	if err != nil {
		return err
	}
	if complete {
		return nil
	}
	temporary, err := os.CreateTemp(paths.Root, ".initialized-*.tmp")
	if err != nil {
		return fmt.Errorf("create initialization receipt: %w", err)
	}
	name := temporary.Name()
	defer os.Remove(name)
	if _, err := temporary.WriteString("{\"version\":1}\n"); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	marker := filepath.Join(paths.Root, "initialized.json")
	if err := os.Link(name, marker); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return fmt.Errorf("publish initialization receipt: %w", err)
		}
		complete, readErr := InitializationComplete(paths)
		if readErr != nil {
			return readErr
		}
		if !complete {
			return errors.New("initialization receipt not complete")
		}
		return nil
	}
	return syncDirectory(paths.Root)
}
