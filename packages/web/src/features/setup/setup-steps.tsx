import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "../../shared/ui/select.js";
import { Button } from "../../shared/ui/button.js";
import { Input } from "../../shared/ui/input.js";
// cspell:words qwen qwen3

import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";

export interface Draft {
  publicOrigin: string;
  url: string;
  key: string;
  model: string;
  dimensions: string;
  similarity: "cosine" | "euclidean";
}

export const initialDraft: Draft = {
  publicOrigin: "",
  url: "https://newapi.y2l.top/v1",
  key: "",
  model: "qwen/qwen3-embedding-8b",
  dimensions: "4096",
  similarity: "cosine"
};

export function isValidVectorDraft(draft: Draft): boolean {
  try {
    const url = new URL(draft.url);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      draft.model.trim().length > 0 &&
      Number.isInteger(Number(draft.dimensions)) &&
      Number(draft.dimensions) >= 1 &&
      Number(draft.dimensions) <= 4096 &&
      ["cosine", "euclidean"].includes(draft.similarity)
    );
  } catch {
    return false;
  }
}

interface SetupFieldProps {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  showKey: boolean;
  onToggleKey: () => void;
}

function VectorConnectionFields({ draft, update, showKey, onToggleKey }: SetupFieldProps) {
  const { t } = useTranslation();
  return (
    <section className="setup-vector-card" aria-labelledby="setup-vector-connection-title">
      <header className="setup-vector-card-header">
        <h2 id="setup-vector-connection-title">{t("setup.vector.connectionTitle")}</h2>
        <p>{t("setup.vector.connectionDescription")}</p>
      </header>
      <div className="setup-field">
        <label htmlFor="setup-url">{t("setup.url")}</label>
        <Input
          id="setup-url"
          type="url"
          value={draft.url}
          onChange={(event) => {
            update("url", event.currentTarget.value);
          }}
        />
      </div>
      <div className="setup-field">
        <label htmlFor="setup-key">
          {t("setup.key")}
          <span className="setup-vector-key-optional">{t("setup.vector.keyOptional")}</span>
        </label>
        <div className="setup-control-with-button">
          <Input
            id="setup-key"
            type={showKey ? "text" : "password"}
            value={draft.key}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              update("key", event.currentTarget.value);
            }}
          />
          <Button
            variant="ghost"
            type="button"
            aria-label={t(showKey ? "setup.hideKey" : "setup.showKey")}
            onClick={onToggleKey}
          >
            <Icon name={showKey ? "eye" : "eyeOff"} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function VectorModelFields({ draft, update }: SetupFieldProps) {
  const { t } = useTranslation();
  return (
    <section className="setup-vector-card" aria-labelledby="setup-vector-model-title">
      <header className="setup-vector-card-header">
        <h2 id="setup-vector-model-title">{t("setup.vector.modelTitle")}</h2>
        <p>{t("setup.vector.modelDescription")}</p>
      </header>
      <div className="setup-field">
        <label htmlFor="setup-model">{t("setup.vector.modelLabel")}</label>
        <Input
          id="setup-model"
          value={draft.model}
          list="setup-model-options"
          onChange={(event) => {
            update("model", event.currentTarget.value);
          }}
        />
        <datalist id="setup-model-options">
          <option value="qwen/qwen3-embedding-8b" />
          <option value="text-embedding-3-small" />
          <option value="text-embedding-3-large" />
        </datalist>
      </div>
      <div className="setup-field-pair setup-vector-params">
        <div className="setup-field">
          <label htmlFor="setup-dimensions">{t("setup.dimensions")}</label>
          <Input
            id="setup-dimensions"
            type="number"
            min="1"
            max="4096"
            value={draft.dimensions}
            onChange={(event) => {
              update("dimensions", event.currentTarget.value);
            }}
          />
        </div>
        <div className="setup-field">
          <label htmlFor="setup-similarity">{t("setup.vector.similarityLabel")}</label>
          <Select
            value={draft.similarity}
            onValueChange={(value) => {
              if (value === "cosine" || value === "euclidean") update("similarity", value);
            }}
          >
            <SelectTrigger id="setup-similarity" className="setup-select">
              <SelectValue>
                {draft.similarity === "cosine" ? t("setup.cosine") : t("setup.euclidean")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="cosine">{t("setup.cosine")}</SelectItem>
              <SelectItem value="euclidean">{t("setup.euclidean")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

export function VectorFields(props: SetupFieldProps) {
  const { t } = useTranslation();
  return (
    <div className="setup-fields setup-vector-fields">
      <div className="setup-vector-grid">
        <VectorConnectionFields {...props} />
        <VectorModelFields {...props} />
      </div>
      <section className="setup-vector-validation" aria-labelledby="setup-vector-validation-title">
        <h2 id="setup-vector-validation-title">{t("setup.vector.validationTitle")}</h2>
        <p className="setup-vector-validation-description">
          {t("setup.vector.validationDescription")}
        </p>
      </section>
    </div>
  );
}
