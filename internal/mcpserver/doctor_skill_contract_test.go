package mcpserver

import (
	"crypto/sha256"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const doctorSkillRoot = "../../plugins/kgos/skills/kgos-doctor"

func doctorSkillText(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(doctorSkillRoot, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func doctorSkillProbe(t *testing.T) string {
	t.Helper()
	blocks := regexp.MustCompile("(?s)```js\\n(.*?)\\n```").FindAllStringSubmatch(
		doctorSkillText(t, "references/knowledge-checks.md"), -1)
	if len(blocks) != 1 {
		t.Fatalf("expected one published read probe, found %d", len(blocks))
	}
	return blocks[0][1]
}

func TestDoctorSkillResourceContract(t *testing.T) {
	root, err := filepath.Abs(doctorSkillRoot)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.SplitN(doctorSkillText(t, "SKILL.md"), "---\n", 3)
	if len(parts) != 3 || parts[0] != "" {
		t.Fatal("missing Skill frontmatter")
	}
	var meta struct {
		Name        string            `yaml:"name"`
		Description string            `yaml:"description"`
		Metadata    map[string]string `yaml:"metadata"`
	}
	decoder := yaml.NewDecoder(strings.NewReader(parts[1]))
	decoder.KnownFields(true)
	if err := decoder.Decode(&meta); err != nil {
		t.Fatal(err)
	}
	if meta.Name != filepath.Base(root) || strings.TrimSpace(meta.Description) == "" || len(meta.Description) > 1024 || meta.Metadata["version"] != "1.2.0" {
		t.Fatalf("invalid Skill metadata: %+v", meta)
	}
	links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
	docPaths := regexp.MustCompile(`\b(?:sdk|cypher|guides)/[\w./-]+\.md\b`)
	queue, seen := []string{filepath.Join(root, "SKILL.md")}, map[string]bool{}
	for len(queue) > 0 {
		path := queue[0]
		queue = queue[1:]
		if seen[path] {
			continue
		}
		seen[path] = true
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, link := range links.FindAllStringSubmatch(string(raw), -1) {
			target := strings.SplitN(link[1], "#", 2)[0]
			next := filepath.Clean(filepath.Join(filepath.Dir(path), target))
			if !strings.HasPrefix(next, root+string(os.PathSeparator)) {
				t.Fatalf("required resource escapes standalone package: %s", link[1])
			}
			queue = append(queue, next)
		}
		for _, doc := range docPaths.FindAllString(string(raw), -1) {
			if _, err := fs.ReadFile(embeddedDocs, "docs/"+doc); err != nil {
				t.Fatalf("unavailable embedded documentation %s: %v", doc, err)
			}
		}
	}
	files := 0
	err = filepath.WalkDir(root, func(path string, item fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !item.IsDir() {
			files++
			if !seen[path] {
				return fmt.Errorf("unreachable packaged resource: %s", path)
			}
		}
		return nil
	})
	if err != nil || files != 5 {
		t.Fatalf("package resources: count=%d error=%v", files, err)
	}
	_ = doctorSkillProbe(t)
}

func TestDoctorGuidanceApprovedBaseline(t *testing.T) {
	body := strings.ReplaceAll(doctorSkillText(t, "assets/global-ai-guidance.md"), "\r\n", "\n")
	const begin, end = "[KGOS_GUIDANCE_BEGIN]", "[KGOS_GUIDANCE_END]"
	if strings.Count(body, begin) != 1 || strings.Count(body, end) != 1 {
		t.Fatal("official guidance requires one matched marker pair")
	}
	start, finish := strings.Index(body, begin), strings.Index(body, end)
	if finish <= start {
		t.Fatal("guidance markers are reversed")
	}
	// Freeze the sole approved source, not its surrounding documentation headings.
	block := body[start:finish+len(end)] + "\n"
	const approved = "d4a594f52128ff6b11cbf8f7649f84c3b99aac0990e210d6895ab85d55c29876"
	if got := fmt.Sprintf("%x", sha256.Sum256([]byte(block))); got != approved {
		t.Fatalf("approved guidance text changed: sha256=%s", got)
	}
}
