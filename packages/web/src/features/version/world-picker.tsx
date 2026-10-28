import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Checkbox } from "../../shared/ui/checkbox.js";
import { Icon } from "../../shared/ui/icon.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/popover.js";
import type { VersionHistory } from "./use-version-history.js";
import type { VersionBranch } from "./version-data.js";

function BranchOption({ branch, history }: { branch: VersionBranch; history: VersionHistory }) {
  const { name } = branch;
  return (
    <label className="version-branch-option">
      <Checkbox
        aria-label={name}
        checked={history.selectedBranches.has(name)}
        onCheckedChange={(checked) => {
          const names = [...history.selectedBranches];
          history.setBranches(checked ? [...names, name] : names.filter((item) => item !== name));
        }}
      />
      <span className={`branch-color-dot is-${branch.color}`} aria-hidden="true" />
      <span className="version-branch-option-name" title={name}>
        {name}
      </span>
    </label>
  );
}

export function CrossWorldFilter({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!history.available) setOpen(false);
  }, [history.available]);
  const allSelected =
    history.branches.length > 0 && history.selectedBranches.size === history.branches.length;
  return (
    <div className="version-branch-picker">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="ghost" className="version-branch-trigger" />}
          aria-label={t("versions.filterBranches")}
        >
          <Icon name="globe" />
          <span className="version-branch-trigger-label">
            {t(allSelected ? "versions.allBranches" : "versions.selectedBranches")}
          </span>
          <span className="version-branch-count">
            {history.selectedBranches.size}/{history.branches.length}
          </span>
          <Icon name="chevronDown" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="version-branch-menu"
          positionerClassName="version-branch-positioner"
          role="group"
          aria-label={t("versions.filterBranches")}
        >
          <div className="version-branch-menu-heading">
            <span>{t("versions.branches")}</span>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                history.setBranches(
                  allSelected ? [] : history.branches.map((branch) => branch.name)
                );
              }}
            >
              {t(allSelected ? "versions.clearAll" : "versions.selectAll")}
            </Button>
          </div>
          {history.branches.map((branch) => (
            <BranchOption key={branch.name} branch={branch} history={history} />
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
