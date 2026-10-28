import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import type { IconName } from "../../shared/ui/icon.js";

export function VersionSwitchAction({
  pending,
  selected
}: {
  pending: boolean;
  selected: boolean;
}) {
  const { t } = useTranslation();
  let icon: IconName = "arrowRight";
  let label = t("versions.switchToVersion");
  if (selected) {
    icon = "check";
    label = t("versions.currentBrowsing");
  }
  if (pending) {
    icon = "refresh";
    label = t("versions.switching");
  }
  return (
    <span className="version-switch-action" data-pending={pending} data-selected={selected}>
      <Icon name={icon} />
      <span>{label}</span>
    </span>
  );
}
