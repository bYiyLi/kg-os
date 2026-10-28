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
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}
	decoder := yaml.NewDecoder(strings.NewReader(parts[1]))
	decoder.KnownFields(true)
	if err := decoder.Decode(&meta); err != nil {
		t.Fatal(err)
	}
	if meta.Name != filepath.Base(root) || strings.TrimSpace(meta.Description) == "" || len(meta.Description) > 1024 {
		t.Fatalf("invalid Skill metadata: %+v", meta)
	}
	for _, required := range []string{
		"用户明确要求", "实际检查", "禁止", "Knowledge 查询", "继续独立项目",
		"不要求额外确认", "只读", "诊断完成不等于修复完成",
		"[线性报告模板](references/report-template.md)", "每完成一项适用检查",
		"结果展示按 D1 → D5 排序", "宿主不支持中途交付",
	} {
		if !strings.Contains(doctorSkillText(t, "SKILL.md"), required) {
			t.Fatalf("missing executable Doctor behavior: %s", required)
		}
	}
	if strings.Contains(doctorSkillText(t, "references/maintenance-evidence.md"), "kgos-maintenance-standards") {
		t.Fatal("Doctor still depends on retired standalone Maintenance Skill")
	}
	if !strings.Contains(doctorSkillText(t, "references/host-checks.md"), "实际安装的 Release") ||
		!strings.Contains(doctorSkillText(t, "references/knowledge-checks.md"), "执行真实、定向、有界的 Knowledge 只读查询") ||
		!strings.Contains(doctorSkillText(t, "references/maintenance-evidence.md"), "VERIFIES") {
		t.Fatal("Doctor evidence references do not cover version, real Knowledge query and event verification")
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
	if err != nil || files != 6 || len(seen) != 6 {
		t.Fatalf("Doctor package resources: files=%d reachable=%d error=%v; want six", files, len(seen), err)
	}
	_ = doctorSkillProbe(t)
}

func TestDoctorLinearReportTemplateContract(t *testing.T) {
	template := doctorSkillText(t, "references/report-template.md")
	for _, required := range []string{
		"## 1. 展示顺序",
		"## 2. 单项结果片段",
		"## 3. 依赖失败与结果更正",
		"## 4. 结束语",
		"D1 → D2 → D3 → D4 → D5",
		"每项获得证据支持的结论或明确受阻后，立即输出",
		"宿主不支持中途交付",
		"未请求项目直接省略",
		"D2 = FAIL",
		"D4 = UNKNOWN",
		"更正 Dn",
		"重新生成一张重复 D1–D5 的总结表",
	} {
		if !strings.Contains(template, required) {
			t.Fatalf("Doctor report template missing required decision: %s", required)
		}
	}
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
	const approved = "ed41a0d05e590b3e37ebb43804be24a1e71db9a8aea9483d77c31b382bd62bb6"
	if got := fmt.Sprintf("%x", sha256.Sum256([]byte(block))); got != approved {
		t.Fatalf("approved guidance text changed: sha256=%s", got)
	}
}
