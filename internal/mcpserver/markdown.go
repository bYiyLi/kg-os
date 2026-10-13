package mcpserver

import (
	"fmt"
	"strings"
)

const maxMarkdownBytes = 32 << 20

var navReplacer = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "|", "&#124;", "`", "&#96;", "\\", "&#92;", "\r", "&#13;", "\n", "&#10;", "*", "\\*", "_", "\\_", "[", "\\[", "]", "\\]", "#", "\\#", "!", "\\!")
var mermaidReplacer = strings.NewReplacer("&", "&amp;", "\"", "&quot;", "<", "&lt;", ">", "&gt;", "\r", "&#13;", "\n", "&#10;", "`", "&#96;")

func navigation(text string) string   { return navReplacer.Replace(text) }
func mermaidLabel(text string) string { return mermaidReplacer.Replace(text) }
func appendFence(lines *[]string, content, language string) {
	largest := 2
	for i := 0; i < len(content); {
		if content[i] != '`' {
			i++
			continue
		}
		j := i + 1
		for j < len(content) && content[j] == '`' {
			j++
		}
		if j-i > largest {
			largest = j - i
		}
		i = j
	}
	fence := strings.Repeat("`", largest+1)
	*lines = append(*lines, fence+language)
	body := strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	if body != "" {
		body = strings.TrimSuffix(body, "\n")
		*lines = append(*lines, strings.Split(body, "\n")...)
	}
	*lines = append(*lines, fence)
}
func commitMessage(lines *[]string, message *string) {
	if message == nil {
		*lines = append(*lines, "（无 Message）")
		return
	}
	appendFence(lines, *message, "markdown")
}
func completeMarkdown(lines []string) (string, error) {
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	// Check before joining: even a perfectly valid large Ontology must not
	// allocate a second unbounded copy just to discover it exceeds the cap.
	size := 1 // terminal newline
	for index, line := range lines {
		size += len(line)
		if index > 0 {
			size++
		}
		if size > maxMarkdownBytes {
			return "", fmt.Errorf("RESOURCE_ERROR: Markdown exceeds resource budget")
		}
	}
	result := strings.Join(lines, "\n") + "\n"
	return result, nil
}
