package runtimeprofile

import (
	"errors"
	"os"
)

// PublishConfig uses a no-replace hard link so concurrent manual edits and
// Setup submissions cannot overwrite a caller-owned configuration.
func PublishConfig(paths Paths, body []byte) error {
	if _, err := ParseConfig(paths, body); err != nil {
		return errors.New("invalid Instance configuration")
	}
	temp, err := os.CreateTemp(paths.Root, ".config-*.tmp")
	if err != nil {
		return errors.New("cannot prepare Instance configuration")
	}
	defer os.Remove(temp.Name())
	if err = temp.Chmod(0o600); err == nil {
		_, err = temp.Write(body)
	}
	if err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err != nil || closeErr != nil {
		return errors.New("cannot write Instance configuration")
	}
	if err = os.Link(temp.Name(), paths.Config); err != nil {
		if errors.Is(err, os.ErrExist) {
			return errors.New("instance configuration already exists")
		}
		return errors.New("cannot publish Instance configuration")
	}
	return syncDirectory(paths.Root)
}
