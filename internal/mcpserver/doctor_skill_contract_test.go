package mcpserver

import (
	"crypto/sha256"
	"encoding/json"
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

func TestDoctorSkillResourceContract(t *testing.T) {
	root, err := filepath.Abs(doctorSkillRoot)
	if err != nil {
		t.Fatal(err)
	}
	body := doctorSkillText(t, "SKILL.md")
	parts := strings.SplitN(body, "---\n", 3)
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
		"全面自检覆盖 D0–D6", "定向自检", "只读",
		"D0 · 版本检查", "serverInfo.version", "最新稳定 Release", "推荐升级",
		"D1 · 全局引导词", "当前会话开始时", "宿主自动加载", "用户自定义指令或项目指令", "不要求 `system` 角色", "不算生效",
		"D2 · MCP 与 State", "kgos_docs", "kgos_query", "evolution.get", "ontology.read",
		"D3 · 官方 Skills", "SKILL.md", "metadata.version", "接口兼容性",
		"D4 · Knowledge", "graph.query", "有限结果",
		"D5 · 持续维护与 VLog", "未启用的可选能力不视为故障",
		"D6 · 本体来源与适配检查", "references/foundations.md", "采用证据",
		"自定义本体是有效选择", "成员资格", "依赖/持续条件",
		"实际执行责任", "目标 State", "不影响 D0–D5",
		"不改模型", "kgos-ontology-standards",
		"PASS", "FAIL", "N/A", "证据不足", "检查受阻",
		"不修改知识库", "不执行修复、升级或部署",
	} {
		if !strings.Contains(body, required) {
			t.Fatalf("missing executable Doctor check: %s", required)
		}
	}
	links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
	seen := map[string]bool{filepath.Join(root, "SKILL.md"): true}
	for _, match := range links.FindAllStringSubmatch(body, -1) {
		target := strings.SplitN(match[1], "#", 2)[0]
		path := filepath.Clean(filepath.Join(root, target))
		if target == "../kgos-ontology-standards/references/foundations.md" {
			if _, err := os.ReadFile(path); err != nil {
				t.Fatal(err)
			}
			continue // Explicit same-Plugin dependency; not a Doctor-owned resource.
		}
		if !strings.HasPrefix(path, root+string(os.PathSeparator)) {
			t.Fatalf("required resource escapes Doctor: %s", match[1])
		}
		if _, err := os.ReadFile(path); err != nil {
			t.Fatal(err)
		}
		seen[path] = true
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
	if err != nil || files != 2 || len(seen) != 2 {
		t.Fatalf("Doctor package resources: files=%d reachable=%d error=%v; want Skill and guidance", files, len(seen), err)
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
	block := body[start:finish+len(end)] + "\n"
	const approved = "964fbcb5d343424808d49488bfeb13c5c1a96a5ef2dfa85d5d0901cb5b0d3f0e"
	if got := fmt.Sprintf("%x", sha256.Sum256([]byte(block))); got != approved {
		t.Fatalf("approved guidance text changed: sha256=%s", got)
	}
}

// D120 material is retained as historical evidence, not current D121 acceptance.
func TestDoctorHistoricalD120EvaluationMaterial(t *testing.T) {
	raw, err := os.ReadFile("../../tests/skills/doctor-current-evaluation.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			ID             string   `json:"id"`
			DoctorSelected bool     `json:"doctorSelected"`
			Criteria       []string `json:"criteria"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{
		"official-ontology-only":         true,
		"official-directory-unavailable": true,
		"official-untagged-main":         true,
		"official-structural-similarity": true,
		"official-customization":         true,
		"official-evidenced-upgrade":     true,
		"official-no-business-need":      true,
		"official-useful-new-model":      true,
		"official-equivalent-local":      true,
		"official-branch-scope":          true,
		"official-untrusted-source":      true,
		"official-no-upgrades-pass":      true,
		"ontology-modeling-not-doctor":   false,
	}
	for _, c := range fixture.Cases {
		if expected, ok := want[c.ID]; ok {
			if c.DoctorSelected != expected || len(c.Criteria) < 2 {
				t.Fatalf("D6 evaluation case %s lacks correct selection/criteria", c.ID)
			}
			delete(want, c.ID)
		}
	}
	if len(want) != 0 {
		t.Fatalf("missing D6 evaluation scenarios: %v", want)
	}
}
