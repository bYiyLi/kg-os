package kernel

import (
	"testing"
)

func TestGitPatchEOFMarkersPreserveExactText(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name, base, hunk, want string
	}{
		{"target without LF", "a\n", "@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n", "b"},
		{"add without LF", "", "@@ -0,0 +1 @@\n+b\n\\ No newline at end of file\n", "b"},
		{"old and new without LF", "a", "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n", "b"},
		{"context without LF", "a", "@@ -1 +1 @@\n a\n\\ No newline at end of file\n", "a"},
		{"add final LF", "a", "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n", "a\n"},
		{"delete without LF", "a", "@@ -1 +0,0 @@\n-a\n\\ No newline at end of file\n", ""},
		{"untouched EOF", "a\nb", "@@ -1 +1 @@\n-a\n+c\n", "c\nb"},
		{"block scalar without LF", "text: |+\n  one\n", "@@ -1,2 +1,2 @@\n-text: |+\n-  one\n+text: |+\n+  two\n\\ No newline at end of file\n", "text: |+\n  two"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			lines := documentLines(test.hunk)
			hunk, next, err := parsePatchHunk(lines, 0)
			if err != nil || next != len(lines) {
				t.Fatalf("parse = %#v, next=%d, err=%v", hunk, next, err)
			}
			got, err := applyExactHunks(test.base, []patchHunk{hunk})
			if err != nil || got != test.want {
				t.Fatalf("apply = %q, err=%v; want %q", got, err, test.want)
			}
		})
	}
	patch := "diff --git a/n:1 b/n:1\n--- a/n:1\n+++ b/n:1\n" + tests[0].hunk +
		"diff --git a/n:2 b/n:2\n--- a/n:2\n+++ b/n:2\n@@ -1 +1 @@\n-x\n+y\n"
	document, err := parseGitPatch(patch)
	if err != nil || len(document.Entries) != 2 || !document.Entries[0].Hunks[0].NewNoNewline {
		t.Fatalf("multi-object EOF patch = %#v, err=%v", document, err)
	}
}

func TestGitPatchEOFMarkersRejectFalseFraming(t *testing.T) {
	t.Parallel()
	for _, hunk := range []string{
		"@@ -1 +1 @@\n\\ No newline at end of file\n-a\n+b\n",
		"@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n\\ No newline at end of file\n",
		"@@ -1,2 +1 @@\n-a\n\\ No newline at end of file\n-b\n+c\n",
		"@@ -1 +1,2 @@\n-a\n+b\n\\ No newline at end of file\n+c\n",
		"@@ -1 +1 @@\n-a\n\\ Invalid marker\n+b\n",
	} {
		if _, _, err := parsePatchHunk(documentLines(hunk), 0); err == nil {
			t.Fatalf("invalid EOF marker accepted: %q", hunk)
		}
	}
	for _, test := range []struct {
		base, hunk string
		code       ErrorCode
	}{
		{"a\n", "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n", CodePatchBaseMismatch},
		{"a", "@@ -1 +1 @@\n-a\n+b\n", CodePatchBaseMismatch},
		{"a\nb\n", "@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n", CodeParse},
		{"a\nb\n", "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n", CodePatchBaseMismatch},
	} {
		hunk, _, err := parsePatchHunk(documentLines(test.hunk), 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = applyExactHunks(test.base, []patchHunk{hunk}); err == nil || AsPublicError(err).Code != test.code {
			t.Fatalf("false EOF = %v; want %s", err, test.code)
		}
	}
	hunks := []patchHunk{
		{OldStart: 1, OldCount: 1, NewStart: 1, NewCount: 1, Lines: []string{"-a", "+b"}, NewNoNewline: true},
		{OldStart: 2, OldCount: 0, NewStart: 2, NewCount: 1, Lines: []string{"+c"}},
	}
	if _, err := applyExactHunks("a\n", hunks); err == nil || AsPublicError(err).Code != CodeParse {
		t.Fatalf("hunk after new EOF = %v", err)
	}
}
