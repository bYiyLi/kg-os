//go:build windows

package runtimeprofile

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

func ensureCredentialPrivate(path string, _ os.FileInfo) error {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return fmt.Errorf("read current Windows user for auth.json: %w", err)
	}
	if user.User.Sid == nil || user.User.Sid.String() == "" {
		return fmt.Errorf("current Windows user has no usable SID for auth.json")
	}
	descriptor, err := windows.SecurityDescriptorFromString("D:P(A;;FA;;;" + user.User.Sid.String() + ")")
	if err != nil {
		return fmt.Errorf("build private auth.json ACL: %w", err)
	}
	dacl, _, err := descriptor.DACL()
	if err != nil {
		return fmt.Errorf("read private auth.json ACL: %w", err)
	}
	if err := windows.SetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil,
		nil,
		dacl,
		nil,
	); err != nil {
		return fmt.Errorf("secure auth.json for current Windows user: %w", err)
	}
	return nil
}
