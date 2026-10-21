import { useTranslation } from "react-i18next";

import type { ThemePreference } from "../lib/use-theme-preference.js";
import { Button } from "./button.js";
import { Icon } from "./icon.js";

const options = [
  { preference: "system", key: "system", icon: "monitor" },
  { preference: "light", key: "light", icon: "sun" },
  { preference: "dark", key: "dark", icon: "moon" }
] as const;

export function ThemeToggle({
  preference,
  onSelect
}: {
  preference: ThemePreference;
  onSelect: (value: ThemePreference) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="theme-toggle" role="group" aria-label={t("versions.appearance")}>
      {options.map((option) => (
        <Button
          variant="ghost"
          key={option.preference}
          className="theme-option"
          type="button"
          aria-label={t("versions." + option.key)}
          aria-pressed={preference === option.preference}
          title={t("versions." + option.key)}
          onClick={() => {
            if (preference !== option.preference) onSelect(option.preference);
          }}
        >
          <Icon name={option.icon} />
        </Button>
      ))}
    </div>
  );
}
