package main

import (
	"fmt"
	"os"
	"strings"
)

type cliLocale string

const (
	localeEnglish cliLocale = "en"
	localeChinese cliLocale = "zh"
)

func detectLocale() cliLocale {
	for _, name := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		value := strings.TrimSpace(os.Getenv(name))
		if value == "" {
			continue
		}
		lower := strings.ToLower(value)
		if lower == "zh" || strings.HasPrefix(lower, "zh_") || strings.HasPrefix(lower, "zh-") {
			return localeChinese
		}
		return localeEnglish
	}
	return localeEnglish
}

func rootHelp(locale cliLocale) string {
	if locale == localeChinese {
		return "KG OS 命令行客户端\n\n" +
			"用法:\n" +
			"  kg [--help] [--version]\n" +
			"  kg doctor [--json]\n" +
			"  kg install [配置参数]\n" +
			"  kg graph query --at <StateRef> [Cypher 参数]\n" +
			"  kg graph execute --branch <name> [Cypher 参数]\n" +
			"  kg object read <ObjectRef> ... --at <StateRef> [--body] [--format <yaml|json>]\n" +
			"  kg object patch --base-state <ResolvedState> --branch <name> [正文参数]\n" +
			"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>]\n" +
			"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <ResolvedState> --edit\n" +
			"  kg ontology patch --base-state <ResolvedState> --branch <name> [正文参数]\n" +
			"  kg evolution <command> [参数]\n\n" +
			"选项:\n" +
			"  -h, --help     显示帮助\n" +
			"  -V, --version  显示已安装版本\n"
	}
	return "KG OS command-line client\n\n" +
		"Usage:\n" +
		"  kg [--help] [--version]\n" +
		"  kg doctor [--json]\n" +
		"  kg install [configuration options]\n" +
		"  kg graph query --at <StateRef> [Cypher options]\n" +
		"  kg graph execute --branch <name> [Cypher options]\n" +
		"  kg object read <ObjectRef> ... --at <StateRef> [--body] [--format <yaml|json>]\n" +
		"  kg object patch --base-state <ResolvedState> --branch <name> [payload options]\n" +
		"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>]\n" +
		"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <ResolvedState> --edit\n" +
		"  kg ontology patch --base-state <ResolvedState> --branch <name> [payload options]\n" +
		"  kg evolution <command> [options]\n\n" +
		"Options:\n" +
		"  -h, --help     Show this help\n" +
		"  -V, --version  Show the installed version\n"
}

func graphHelp(locale cliLocale) string {
	if locale == localeChinese {
		return "KG OS Graph 命令\n\n" +
			"用法:\n" +
			"  kg graph query --at <StateRef> (--cypher <text> | --cypher-file <path> | stdin)\n" +
			"    [--params <json-map> | --params-file <path>] [--pretty | --stream]\n" +
			"  kg graph execute --branch <name> (--cypher <text> | --cypher-file <path> | stdin)\n" +
			"    [--params <json-map> | --params-file <path>] [--author <text>] [--message <text>]\n" +
			"    [--pretty | --stream]\n\n" +
			"query 使用只读 State snapshot；execute 每次重新 checkout 指定 Branch。\n"
	}
	return "KG OS Graph commands\n\n" +
		"Usage:\n" +
		"  kg graph query --at <StateRef> (--cypher <text> | --cypher-file <path> | stdin)\n" +
		"    [--params <json-map> | --params-file <path>] [--pretty | --stream]\n" +
		"  kg graph execute --branch <name> (--cypher <text> | --cypher-file <path> | stdin)\n" +
		"    [--params <json-map> | --params-file <path>] [--author <text>] [--message <text>]\n" +
		"    [--pretty | --stream]\n\n" +
		"query uses a read-only State snapshot; execute re-checks out the requested Branch for every operation.\n"
}

func objectHelp(locale cliLocale) string {
	if locale == localeChinese {
		return "KG OS Object 命令\n\n" +
			"用法:\n" +
			"  kg object read <ObjectRef> ... --at <StateRef> [--body] [--format <yaml|json>] [--pretty]\n" +
			"  kg object read --refs-file <path> --at <StateRef> [--body] [--format <yaml|json>] [--pretty]\n" +
			"  <refs> | kg object read --at <StateRef> [--body] [--format <yaml|json>] [--pretty]\n" +
			"  kg object patch --base-state <commit/...> --branch <name>\n" +
			"    [--patch <diff> | --patch-file <path> | stdin] [--author <text>] [--message <text>]\n\n" +
			"ObjectRef: domain:<name> | node:<name> | relationship:<name> | n:<id> | r:<id>\n" +
			"read 默认输出 JSON envelope；--body 默认输出 canonical YAML。\n"
	}
	return "KG OS Object commands\n\n" +
		"Usage:\n" +
		"  kg object read <ObjectRef> ... --at <StateRef> [--body] [--format <yaml|json>] [--pretty]\n" +
		"  kg object read --refs-file <path> --at <StateRef> [--body] [--format <yaml|json>] [--pretty]\n" +
		"  <refs> | kg object read --at <StateRef> [--body] [--format <yaml|json>] [--pretty]\n" +
		"  kg object patch --base-state <commit/...> --branch <name>\n" +
		"    [--patch <diff> | --patch-file <path> | stdin] [--author <text>] [--message <text>]\n\n" +
		"ObjectRef: domain:<name> | node:<name> | relationship:<name> | n:<id> | r:<id>\n" +
		"read emits a JSON envelope by default; --body emits canonical YAML by default.\n"
}

func ontologyHelp(locale cliLocale) string {
	if locale == localeChinese {
		return "KG OS Ontology 命令\n\n" +
			"用法:\n" +
			"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <1..1000>] [--cursor <token>]\n" +
			"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <commit/...> --edit\n" +
			"  kg ontology patch --base-state <commit/...> --branch <name>\n" +
			"    [--patch <diff> | --patch-file <path> | stdin] [--author <text>] [--message <text>]\n\n" +
			"OntologyRef: domain:<name> | node:<name> | relationship:<name>\n" +
			"读取输出 Markdown；--edit 输出服务端 canonical YAML；patch 输出 JSON。\n"
	}
	return "KG OS Ontology commands\n\n" +
		"Usage:\n" +
		"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <1..1000>] [--cursor <token>]\n" +
		"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <commit/...> --edit\n" +
		"  kg ontology patch --base-state <commit/...> --branch <name>\n" +
		"    [--patch <diff> | --patch-file <path> | stdin] [--author <text>] [--message <text>]\n\n" +
		"OntologyRef: domain:<name> | node:<name> | relationship:<name>\n" +
		"Reads emit Markdown; --edit emits server-rendered canonical YAML; patch emits JSON.\n"
}

func evolutionHelp(locale cliLocale) string {
	if locale == localeChinese {
		return "KG OS Evolution 命令\n\n" +
			"用法:\n" +
			"  kg evolution overview [--pretty]\n" +
			"  kg evolution get <StateRef> [--pretty]\n" +
			"  kg evolution ancestry <StateRef> [--limit <1..1000>] [--cursor <token>] [--pretty]\n" +
			"  kg evolution history <StateRef> --scope <all|ontology|knowledge|object> [范围参数] [分页参数] [--pretty]\n" +
			"  kg evolution diff --before <StateRef> --after <StateRef> --scope <all|ontology|knowledge|object> [范围参数] [分页参数] [--pretty]\n" +
			"  kg evolution state create --branch <name> [--data <json> | --data-file <path>] [--author <text>] [--message <text>] [--pretty]\n" +
			"  kg evolution state set-data <StateRef> (--data <json> | --data-file <path> | stdin) [--pretty]\n" +
			"  kg evolution state clear-data <StateRef> [--pretty]\n" +
			"  kg evolution branch list|create|delete ... [--pretty]\n" +
			"  kg evolution tag list|create|move|delete ... [--pretty]\n" +
			"  kg evolution merge start --branch <name> --source <StateRef> [--pretty]\n" +
			"  kg evolution merge list [--limit <1..1000>] [--cursor <token>] [--pretty]\n" +
			"  kg evolution merge get <session> [--pretty]\n" +
			"  kg evolution merge conflicts <session> [--limit <1..1000>] [--cursor <token>] [--pretty]\n" +
			"  kg evolution merge resolve <session> --expected-revision <integer>\n" +
			"    (--resolutions <json-array> | --resolutions-file <path> | stdin) [--pretty]\n" +
			"  kg evolution merge finalize <session> --expected-revision <integer> [--author <text>] [--message <text>] [--pretty]\n" +
			"  kg evolution merge abort <session> --expected-revision <integer> [--pretty]\n\n" +
			"scope=object 时必须同时提供 --object-ref <ObjectRef> 与 --anchor-state <StateRef>。\n"
	}
	return "KG OS Evolution commands\n\n" +
		"Usage:\n" +
		"  kg evolution overview [--pretty]\n" +
		"  kg evolution get <StateRef> [--pretty]\n" +
		"  kg evolution ancestry <StateRef> [--limit <1..1000>] [--cursor <token>] [--pretty]\n" +
		"  kg evolution history <StateRef> --scope <all|ontology|knowledge|object> [scope options] [pagination options] [--pretty]\n" +
		"  kg evolution diff --before <StateRef> --after <StateRef> --scope <all|ontology|knowledge|object> [scope options] [pagination options] [--pretty]\n" +
		"  kg evolution state create --branch <name> [--data <json> | --data-file <path>] [--author <text>] [--message <text>] [--pretty]\n" +
		"  kg evolution state set-data <StateRef> (--data <json> | --data-file <path> | stdin) [--pretty]\n" +
		"  kg evolution state clear-data <StateRef> [--pretty]\n" +
		"  kg evolution branch list|create|delete ... [--pretty]\n" +
		"  kg evolution tag list|create|move|delete ... [--pretty]\n" +
		"  kg evolution merge start --branch <name> --source <StateRef> [--pretty]\n" +
		"  kg evolution merge list [--limit <1..1000>] [--cursor <token>] [--pretty]\n" +
		"  kg evolution merge get <session> [--pretty]\n" +
		"  kg evolution merge conflicts <session> [--limit <1..1000>] [--cursor <token>] [--pretty]\n" +
		"  kg evolution merge resolve <session> --expected-revision <integer>\n" +
		"    (--resolutions <json-array> | --resolutions-file <path> | stdin) [--pretty]\n" +
		"  kg evolution merge finalize <session> --expected-revision <integer> [--author <text>] [--message <text>] [--pretty]\n" +
		"  kg evolution merge abort <session> --expected-revision <integer> [--pretty]\n\n" +
		"scope=object requires both --object-ref <ObjectRef> and --anchor-state <StateRef>.\n"
}

func installHelp(locale cliLocale) string {
	usage := "  kg install\n" +
		"    [--server-host <ipv4>] [--server-port <1..65535>]\n" +
		"    [--cache-path <path>] [--cache-max-size-mb <n>]\n" +
		"    [--fulltext-analyzer <fts5-spec>]\n" +
		"    [--embedding-base-url <url>] [--embedding-model <id>]\n" +
		"    [--embedding-dimensions <1..4096>]\n" +
		"    [--embedding-similarity <cosine|euclidean>]\n" +
		"    [--embedding-api-key-env <name-or-empty>]\n"
	if locale == localeChinese {
		return "安装当前 KG_HOME\n\n用法:\n" + usage +
			"\n全部参数提供时不会进入交互；缺失参数仅在 stdin/stdout 都是 TTY 时询问。\n"
	}
	return "Install the current KG_HOME\n\nUsage:\n" + usage +
		"\nFully parameterized installs are non-interactive; missing values are prompted only when stdin/stdout are TTYs.\n"
}

func doctorHelp(locale cliLocale) string {
	if locale == localeChinese {
		return "诊断当前 KG OS 安装，不进行任何修改。\n\n用法:\n  kg doctor [--json]\n"
	}
	return "Diagnose the current KG OS installation without modifying it.\n\nUsage:\n  kg doctor [--json]\n"
}

func initializationWarning(locale cliLocale) string {
	if locale == localeChinese {
		return "以下配置初始化后禁止修改。\n"
	}
	return "The following settings must not be changed after initialization.\n"
}

func installSuccess(locale cliLocale, home string) string {
	if locale == localeChinese {
		return fmt.Sprintf("KG OS 已安装到 %s。\n", home)
	}
	return fmt.Sprintf("KG OS installed in %s.\n", home)
}

func installPrompt(locale cliLocale, key, recommended string) string {
	if key == "embedding.api_key_env" {
		if locale == localeChinese {
			return fmt.Sprintf("%s（推荐 %s；无认证输入 \"\"）: ", key, recommended)
		}
		return fmt.Sprintf("%s (recommended %s; enter \"\" for no auth): ", key, recommended)
	}
	if locale == localeChinese {
		return fmt.Sprintf("%s（推荐 %s）: ", key, recommended)
	}
	return fmt.Sprintf("%s (recommended %s): ", key, recommended)
}

func doctorTitle(locale cliLocale) string {
	if locale == localeChinese {
		return "KG OS 诊断"
	}
	return "KG OS doctor"
}

func doctorReadyText(locale cliLocale, ready bool) string {
	if locale == localeChinese {
		if ready {
			return "就绪: 是"
		}
		return "就绪: 否"
	}
	if ready {
		return "Ready: yes"
	}
	return "Ready: no"
}

func unsupportedCommandMessage(locale cliLocale) string {
	if locale == localeChinese {
		return "当前命令不可用"
	}
	return "command is not available in the current implementation"
}
