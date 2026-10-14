import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";

import { AppBrand } from "./header.js";
import { LanguageSwitcher } from "./language-switcher.js";

const previewCommits = [
  { label: "v0.4.0", hash: "a81c2f", amount: -2, unit: "hour", color: "violet" },
  { label: "v0.3.0", hash: "9d3e7a", amount: -3, unit: "day", color: "blue" },
  { label: "v0.2.0", hash: "7a1d9e", amount: -1, unit: "week", color: "green" },
  { label: "v0.1.0", hash: "e4c9a1", amount: -2, unit: "week", color: "orange" }
] as const;

const previewBranches = [
  { label: "develop", count: 3, direction: "ahead" },
  { label: "feature/search", count: 1, direction: "ahead" },
  { label: "feature/ui", count: 2, direction: "behind" }
] as const;

export type Theme = "dark" | "light";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="theme-toggle" role="group" aria-label={t("versions.appearance")}>
      <button
        className="theme-option"
        type="button"
        aria-label={t("versions.light")}
        aria-pressed={theme === "light"}
        title={t("versions.light")}
        onClick={() => {
          if (theme !== "light") {
            onToggle();
          }
        }}
      >
        <Icon name="sun" />
      </button>
      <button
        className="theme-option"
        type="button"
        aria-label={t("versions.dark")}
        aria-pressed={theme === "dark"}
        title={t("versions.dark")}
        onClick={() => {
          if (theme !== "dark") {
            onToggle();
          }
        }}
      >
        <Icon name="moon" />
      </button>
    </div>
  );
}

// The version names and hashes are design examples, not an SDK response.
export function VersionTree() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const relativeTime = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="version-tree" aria-label={t("versions.tree")}>
      <div className="version-tree-example-label">{t("versions.example")}</div>
      <div className="version-current">
        <Icon name="branch" />
        <span>main</span>
        <Icon name="more" />
      </div>

      <ol className="commit-list" aria-label={t("versions.history")}>
        {previewCommits.map((commit) => (
          <li className="commit-item" key={commit.hash}>
            <span className={`commit-dot is-${commit.color}`} aria-hidden="true" />
            <span className="commit-details">
              <span className="commit-title">{commit.label}</span>
              <span className="commit-meta">
                <span>{commit.hash}</span>
                <span>{relativeTime.format(commit.amount, commit.unit)}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>

      <section className="branch-section" aria-labelledby="branches-title">
        <h2 id="branches-title">
          <Icon name="chevronDown" />
          {t("versions.branches")}
        </h2>
        <ul className="branch-list">
          {previewBranches.map((branch) => (
            <li key={branch.label}>
              <Icon name="branch" />
              <span className="branch-name">{branch.label}</span>
              <span className="branch-status">
                {t(`versions.${branch.direction}`, { count: number.format(branch.count) })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function VersionSidebar({
  collapsed,
  theme,
  onToggleTheme,
  onDisconnect
}: {
  collapsed: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onDisconnect?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <aside
      id="kgos-version-sidebar"
      className="version-sidebar"
      aria-label={t("versions.navigation")}
      aria-hidden={collapsed}
      inert={collapsed}
    >
      <AppBrand />
      <div className="version-sidebar-scroll">
        <VersionTree />
      </div>
      <div className="sidebar-bottom">
        {onDisconnect !== undefined && (
          <button className="connection-disconnect" type="button" onClick={onDisconnect}>
            <Icon name="lock" />
            <span>{t("versions.disconnect")}</span>
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
