package kernel

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

type patchOperation uint8

const (
	patchUpdate patchOperation = iota
	patchAdd
	patchDelete
	patchRename
)

type patchDocument struct {
	Entries []patchEntry
}

type patchEntry struct {
	Operation  patchOperation
	OldTarget  string
	NewTarget  string
	RenameFrom string
	RenameTo   string
	Hunks      []patchHunk
}

type patchHunk struct {
	OldStart int
	OldCount int
	NewStart int
	NewCount int
	Lines    []string
}

var hunkHeaderPattern = regexp.MustCompile(`^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@(?: .*)?$`)

func parseGitPatch(text string) (patchDocument, error) {
	if strings.TrimSpace(text) == "" {
		return patchDocument{}, publicError(CodeParse, "Patch is empty", nil)
	}
	if strings.Contains(text, "\r") {
		return patchDocument{}, publicError(CodeParse, "Patch must use LF line endings", nil)
	}
	lines := strings.Split(text, "\n")
	if len(lines) != 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	document := patchDocument{}
	for index := 0; index < len(lines); {
		if !strings.HasPrefix(lines[index], "diff --git ") {
			return patchDocument{}, publicError(CodeParse, "Patch entry must start with diff --git", nil)
		}
		oldPath, newPath, err := parseDiffGitPaths(strings.TrimPrefix(lines[index], "diff --git "))
		if err != nil {
			return patchDocument{}, err
		}
		entry := patchEntry{OldTarget: stripGitPrefix(oldPath, "a/"), NewTarget: stripGitPrefix(newPath, "b/")}
		index++
		newFile := false
		deletedFile := false
		fileHeaders := false
		oldHeaderDevNull := false
		newHeaderDevNull := false
		for index < len(lines) && !strings.HasPrefix(lines[index], "diff --git ") {
			line := lines[index]
			switch {
			case line == "new file mode 100644":
				newFile = true
				index++
			case line == "deleted file mode 100644":
				deletedFile = true
				index++
			case strings.HasPrefix(line, "similarity index "),
				strings.HasPrefix(line, "dissimilarity index "),
				strings.HasPrefix(line, "index "):
				index++
			case strings.HasPrefix(line, "rename from "):
				entry.RenameFrom, err = parseSingleGitPath(strings.TrimPrefix(line, "rename from "))
				if err != nil {
					return patchDocument{}, err
				}
				index++
			case strings.HasPrefix(line, "rename to "):
				entry.RenameTo, err = parseSingleGitPath(strings.TrimPrefix(line, "rename to "))
				if err != nil {
					return patchDocument{}, err
				}
				index++
			case strings.HasPrefix(line, "copy from "), strings.HasPrefix(line, "copy to "),
				strings.HasPrefix(line, "old mode "), strings.HasPrefix(line, "new mode "),
				line == "GIT binary patch", strings.HasPrefix(line, "Binary files "):
				return patchDocument{}, publicError(CodeUnsupportedOperation, "Patch form is outside the KG OS v1 Git profile", nil)
			case strings.HasPrefix(line, "--- "):
				oldHeader, headerErr := parseSingleGitPath(strings.TrimPrefix(line, "--- "))
				if headerErr != nil {
					return patchDocument{}, headerErr
				}
				index++
				if index >= len(lines) || !strings.HasPrefix(lines[index], "+++ ") {
					return patchDocument{}, publicError(CodeParse, "Patch file header is missing +++", nil)
				}
				newHeader, headerErr := parseSingleGitPath(strings.TrimPrefix(lines[index], "+++ "))
				if headerErr != nil {
					return patchDocument{}, headerErr
				}
				index++
				fileHeaders = true
				if oldHeader != "/dev/null" && stripGitPrefix(oldHeader, "a/") != entry.OldTarget {
					return patchDocument{}, publicError(CodeParse, "Patch --- path does not match diff --git target", nil)
				}
				if newHeader != "/dev/null" && stripGitPrefix(newHeader, "b/") != entry.NewTarget {
					return patchDocument{}, publicError(CodeParse, "Patch +++ path does not match diff --git target", nil)
				}
				if oldHeader == "/dev/null" {
					newFile = true
					oldHeaderDevNull = true
				}
				if newHeader == "/dev/null" {
					deletedFile = true
					newHeaderDevNull = true
				}
				for index < len(lines) && strings.HasPrefix(lines[index], "@@ ") {
					hunk, next, hunkErr := parsePatchHunk(lines, index)
					if hunkErr != nil {
						return patchDocument{}, hunkErr
					}
					entry.Hunks = append(entry.Hunks, hunk)
					index = next
				}
			default:
				return patchDocument{}, publicError(CodeParse, "unexpected Git Patch line: "+line, nil)
			}
		}

		switch {
		case newFile && deletedFile:
			return patchDocument{}, publicError(CodeParse, "Patch entry cannot be both add and delete", nil)
		case newFile:
			entry.Operation = patchAdd
			if !fileHeaders || !oldHeaderDevNull || newHeaderDevNull || len(entry.Hunks) == 0 {
				return patchDocument{}, publicError(CodeParse, "Add entry requires /dev/null file headers and hunks", nil)
			}
		case deletedFile:
			entry.Operation = patchDelete
			if !fileHeaders || oldHeaderDevNull || !newHeaderDevNull || len(entry.Hunks) == 0 {
				return patchDocument{}, publicError(CodeParse, "Delete entry requires /dev/null file headers and hunks", nil)
			}
		case entry.RenameFrom != "" || entry.RenameTo != "":
			entry.Operation = patchRename
			if entry.RenameFrom == "" || entry.RenameTo == "" ||
				entry.RenameFrom != entry.OldTarget || entry.RenameTo != entry.NewTarget {
				return patchDocument{}, publicError(CodeParse, "Rename headers do not match diff --git targets", nil)
			}
		case len(entry.Hunks) != 0:
			entry.Operation = patchUpdate
			if entry.OldTarget != entry.NewTarget || !fileHeaders {
				return patchDocument{}, publicError(CodeParse, "Update entry target is inconsistent", nil)
			}
		default:
			return patchDocument{}, publicError(CodeUnsupportedOperation, "mode-only or metadata-only Patch entry is unsupported", nil)
		}
		document.Entries = append(document.Entries, entry)
	}
	if len(document.Entries) == 0 {
		return patchDocument{}, publicError(CodeParse, "Patch has no entries", nil)
	}
	return document, nil
}

func parsePatchHunk(lines []string, start int) (patchHunk, int, error) {
	matches := hunkHeaderPattern.FindStringSubmatch(lines[start])
	if matches == nil {
		return patchHunk{}, start, publicError(CodeParse, "invalid unified diff hunk header", nil)
	}
	parseCount := func(startValue, countValue string) (int, int, error) {
		position, err := strconv.Atoi(startValue)
		if err != nil {
			return 0, 0, err
		}
		count := 1
		if countValue != "" {
			count, err = strconv.Atoi(countValue)
			if err != nil {
				return 0, 0, err
			}
		}
		return position, count, nil
	}
	oldStart, oldCount, err := parseCount(matches[1], matches[2])
	if err != nil {
		return patchHunk{}, start, publicError(CodeParse, "invalid old hunk range", err)
	}
	newStart, newCount, err := parseCount(matches[3], matches[4])
	if err != nil {
		return patchHunk{}, start, publicError(CodeParse, "invalid new hunk range", err)
	}
	hunk := patchHunk{OldStart: oldStart, OldCount: oldCount, NewStart: newStart, NewCount: newCount}
	oldSeen, newSeen := 0, 0
	index := start + 1
	for index < len(lines) {
		line := lines[index]
		if strings.HasPrefix(line, "diff --git ") || strings.HasPrefix(line, "@@ ") {
			break
		}
		if line == "" {
			return patchHunk{}, start, publicError(CodeParse, "unified diff line is missing its prefix", nil)
		}
		switch line[0] {
		case ' ':
			oldSeen++
			newSeen++
		case '-':
			oldSeen++
		case '+':
			newSeen++
		case '\\':
			return patchHunk{}, start, publicError(CodeUnsupportedOperation, "no-newline Git markers are not needed for canonical YAML", nil)
		default:
			return patchHunk{}, start, publicError(CodeParse, "invalid unified diff line prefix", nil)
		}
		hunk.Lines = append(hunk.Lines, line)
		index++
		if oldSeen == oldCount && newSeen == newCount {
			break
		}
		if oldSeen > oldCount || newSeen > newCount {
			return patchHunk{}, start, publicError(CodeParse, "hunk line counts exceed header ranges", nil)
		}
	}
	if oldSeen != oldCount || newSeen != newCount {
		return patchHunk{}, start, publicError(CodeParse, "hunk line counts do not match header ranges", nil)
	}
	return hunk, index, nil
}

func applyExactHunks(base string, hunks []patchHunk) (string, error) {
	baseLines := documentLines(base)
	output := make([]string, 0, len(baseLines))
	baseIndex := 0
	for _, hunk := range hunks {
		position := hunk.OldStart - 1
		if hunk.OldStart == 0 {
			position = 0
		}
		if position < baseIndex || position > len(baseLines) {
			return "", publicError(CodePatchBaseMismatch, "Patch hunk start does not match canonical base", nil)
		}
		output = append(output, baseLines[baseIndex:position]...)
		baseIndex = position
		if hunk.NewStart > 0 && hunk.NewStart-1 != len(output) {
			return "", publicError(CodePatchBaseMismatch, "Patch new hunk range is inconsistent", nil)
		}
		if hunk.NewStart == 0 && len(output) != 0 {
			return "", publicError(CodePatchBaseMismatch, "Patch new hunk range is inconsistent", nil)
		}
		oldUsed, newUsed := 0, 0
		for _, line := range hunk.Lines {
			content := line[1:]
			switch line[0] {
			case ' ':
				if baseIndex >= len(baseLines) || baseLines[baseIndex] != content {
					return "", publicError(CodePatchBaseMismatch, "Patch context does not match canonical base", nil)
				}
				output = append(output, content)
				baseIndex++
				oldUsed++
				newUsed++
			case '-':
				if baseIndex >= len(baseLines) || baseLines[baseIndex] != content {
					return "", publicError(CodePatchBaseMismatch, "Patch removal does not match canonical base", nil)
				}
				baseIndex++
				oldUsed++
			case '+':
				output = append(output, content)
				newUsed++
			}
		}
		if oldUsed != hunk.OldCount || newUsed != hunk.NewCount {
			return "", publicError(CodePatchBaseMismatch, "Patch hunk counts do not match canonical base", nil)
		}
	}
	output = append(output, baseLines[baseIndex:]...)
	if len(output) == 0 {
		return "", nil
	}
	return strings.Join(output, "\n") + "\n", nil
}

func documentLines(body string) []string {
	if body == "" {
		return nil
	}
	if !strings.HasSuffix(body, "\n") {
		return strings.Split(body, "\n")
	}
	return strings.Split(strings.TrimSuffix(body, "\n"), "\n")
}

func parseDiffGitPaths(raw string) (string, string, error) {
	tokens, err := splitGitTokens(raw)
	if err != nil || len(tokens) != 2 {
		return "", "", publicError(CodeParse, "diff --git must contain exactly two paths", err)
	}
	if !strings.HasPrefix(tokens[0], "a/") || !strings.HasPrefix(tokens[1], "b/") {
		return "", "", publicError(CodeParse, "diff --git paths must use a/ and b/ prefixes", nil)
	}
	return tokens[0], tokens[1], nil
}

func parseSingleGitPath(raw string) (string, error) {
	tokens, err := splitGitTokens(raw)
	if err != nil {
		return "", err
	}
	if len(tokens) != 1 {
		return "", publicError(CodeParse, "Git path field must contain exactly one path", nil)
	}
	return tokens[0], nil
}

func splitGitTokens(raw string) ([]string, error) {
	var tokens []string
	for index := 0; index < len(raw); {
		for index < len(raw) && raw[index] == ' ' {
			index++
		}
		if index == len(raw) {
			break
		}
		if raw[index] == '"' {
			start := index
			index++
			escaped := false
			for index < len(raw) {
				if escaped {
					escaped = false
					index++
					continue
				}
				if raw[index] == '\\' {
					escaped = true
					index++
					continue
				}
				if raw[index] == '"' {
					index++
					break
				}
				index++
			}
			if index > len(raw) || raw[index-1] != '"' {
				return nil, publicError(CodeParse, "unterminated quoted Git path", nil)
			}
			decoded, err := strconv.Unquote(raw[start:index])
			if err != nil || !utf8.ValidString(decoded) {
				return nil, publicError(CodeParse, "invalid quoted Git path", err)
			}
			tokens = append(tokens, decoded)
			continue
		}
		start := index
		for index < len(raw) && raw[index] != ' ' && raw[index] != '\t' {
			index++
		}
		token := raw[start:index]
		if token == "" || !utf8.ValidString(token) {
			return nil, publicError(CodeParse, "invalid Git path", nil)
		}
		tokens = append(tokens, token)
	}
	return tokens, nil
}

func stripGitPrefix(path, prefix string) string {
	return strings.TrimPrefix(path, prefix)
}
