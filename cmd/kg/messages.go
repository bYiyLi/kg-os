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
			"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>]\n" +
			"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <ResolvedState> --edit\n" +
			"  kg ontology patch --base-state <ResolvedState> --branch <name> [正文参数]\n\n" +
			"选项:\n" +
			"  -h, --help     显示帮助\n" +
			"  -V, --version  显示已安装版本\n"
	}
	return "KG OS command-line client\n\n" +
		"Usage:\n" +
		"  kg [--help] [--version]\n" +
		"  kg doctor [--json]\n" +
		"  kg install [configuration options]\n" +
		"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>]\n" +
		"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <ResolvedState> --edit\n" +
		"  kg ontology patch --base-state <ResolvedState> --branch <name> [payload options]\n\n" +
		"Options:\n" +
		"  -h, --help     Show this help\n" +
		"  -V, --version  Show the installed version\n"
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
