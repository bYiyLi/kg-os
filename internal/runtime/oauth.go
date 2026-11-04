package runtime

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

// An OAuth storage fault is retained independently from the graph Runtime.
// Discovery, direct Instance Bearer, API and Web continue to work while OAuth
// requests fail closed. Recovery never deletes or replaces existing state.
func openOAuthStore(paths runtimeprofile.Paths, credential runtimeprofile.Credential, config runtimeprofile.Config) (*mcpoauth.Store, error) {
	if config.Server == nil || config.Server.PublicOrigin == "" {
		return nil, nil
	}
	issuer := strings.TrimSuffix(config.Server.PublicOrigin, "/")
	digest := sha256.Sum256([]byte(credential.Token))
	return mcpoauth.Open(filepath.Join(paths.Root, "mcp-oauth.db"), fmt.Sprintf("%x", digest), issuer, issuer)
}
