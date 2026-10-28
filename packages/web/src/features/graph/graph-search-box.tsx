import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import { Button } from "../../shared/ui/button.js";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../shared/ui/input-group.js";

function modalOpen() {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

interface SearchBoxProps {
  disabled: boolean;
  busy: boolean;
  onSearch: (query: string) => void;
  onClear: () => void;
}

function useSearchInput({ disabled, onSearch, onClear }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const composing = useRef(false);
  const mac = /Macintosh|Mac OS|iPhone|iPad/.test(navigator.userAgent);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (
        disabled ||
        modalOpen() ||
        input.current?.closest('[inert], [aria-hidden="true"]') !== null ||
        event.isComposing ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "k"
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target !== input.current &&
        target.closest('input, textarea, [contenteditable="true"]') !== null
      )
        return;
      event.preventDefault();
      input.current.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => {
      window.removeEventListener("keydown", focusSearch);
    };
  }, [disabled]);

  function clear() {
    setQuery("");
    onClear();
    input.current?.focus();
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && !composing.current && query.trim() !== "") onSearch(query);
  }

  return { query, setQuery, focused, setFocused, input, composing, mac, clear, submit };
}

export function GraphSearchBox(props: SearchBoxProps) {
  const { t } = useTranslation();
  const { disabled, busy } = props;
  const { query, setQuery, focused, setFocused, input, composing, mac, clear, submit } =
    useSearchInput(props);
  return (
    <form className="graph-search" role="search" aria-label={t("graph.search")} onSubmit={submit}>
      <InputGroup className="graph-search-field">
        <InputGroupAddon>
          <Icon name="search" />
        </InputGroupAddon>
        <InputGroupInput
          ref={input}
          type="search"
          autoComplete="off"
          maxLength={256}
          value={query}
          disabled={disabled}
          aria-label={t("graph.search")}
          aria-describedby={focused && !busy ? "graph-search-hint" : undefined}
          placeholder={t("graph.searchPlaceholder")}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (query !== "" || busy) clear();
              else input.current?.blur();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          {query !== "" || busy ? (
            <Button
              className="graph-search-clear"
              variant="ghost"
              type="button"
              disabled={disabled}
              aria-label={t(busy ? "graph.cancelSearch" : "graph.clearSearch")}
              onClick={clear}
            >
              <Icon name="close" />
            </Button>
          ) : (
            <kbd aria-hidden="true">{mac ? "⌘" : "Ctrl"} K</kbd>
          )}
        </InputGroupAddon>
      </InputGroup>
      {focused && !busy && (
        <p className="graph-search-hint" id="graph-search-hint">
          {t("graph.searchHint")}
        </p>
      )}
      {busy && (
        <p className="graph-search-hint" role="status">
          {t("graph.searching")}
        </p>
      )}
    </form>
  );
}
