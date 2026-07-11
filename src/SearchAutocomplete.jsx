import React, { useMemo, useRef, useState } from "react";

const FILTER_ALIASES = {
  type: "type",
  record: "type",
  record_type: "type",

  faction: "faction",
  fac: "faction",

  class: "class",
  classification: "class",
  cls: "class",

  threat: "threat",
  threat_class: "threat",
  tc: "threat",
};

function findTokenStart(text, cursor) {
  let inQuotes = false;

  for (let index = cursor - 1; index >= 0; index -= 1) {
    const character = text[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(character)) {
      return index + 1;
    }
  }

  return 0;
}

function findTokenEnd(text, cursor) {
  let inQuotes = false;

  for (let index = cursor; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(character)) {
      return index;
    }
  }

  return text.length;
}

function quoteValue(value) {
  const clean = String(value || "").trim();
  return /\s/.test(clean)
    ? `"${clean.replaceAll('"', "")}"`
    : clean;
}

function getContext(text, cursor, options) {
  const start = findTokenStart(text, cursor);
  const end = findTokenEnd(text, cursor);
  const partialToken = text.slice(start, cursor);

  const match = partialToken.match(
    /^([+-]?)([A-Za-z_][A-Za-z0-9_-]*):(.*)$/
  );

  if (!match) return null;

  const [, prefix, typedKey, rawFragment] = match;
  const canonicalKey = FILTER_ALIASES[typedKey.toLowerCase()];

  if (!canonicalKey) return null;

  const values = options?.[canonicalKey] || [];
  if (!values.length) return null;

  const fragment = rawFragment
    .replace(/^"/, "")
    .replace(/"$/, "")
    .trim()
    .toLowerCase();

  const suggestions = values
    .map(String)
    .filter((value) =>
      !fragment || value.toLowerCase().includes(fragment)
    )
    .sort((left, right) => {
      const leftLower = left.toLowerCase();
      const rightLower = right.toLowerCase();
      const leftRank = leftLower.startsWith(fragment) ? 0 : 1;
      const rightRank = rightLower.startsWith(fragment) ? 0 : 1;

      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.localeCompare(right);
    })
    .slice(0, 12);

  if (!suggestions.length) return null;

  return {
    start,
    end,
    cursor,
    prefix,
    typedKey,
    canonicalKey,
    suggestions,
  };
}

export default function SearchAutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  autoFocus = false,
}) {
  const inputRef = useRef(null);
  const [cursor, setCursor] = useState(value.length);
  const [highlighted, setHighlighted] = useState(0);
  const [dismissedToken, setDismissedToken] = useState("");

  const context = useMemo(
    () => getContext(value, cursor, options),
    [value, cursor, options]
  );

  const activeToken = context
    ? value.slice(context.start, context.cursor)
    : "";

  const isOpen =
    Boolean(context?.suggestions?.length) &&
    activeToken !== dismissedToken;

  function syncInput(element) {
    setCursor(element.selectionStart ?? element.value.length);
    setHighlighted(0);
    setDismissedToken("");
  }

  function chooseSuggestion(suggestion) {
    if (!context) return;

    const replacement =
      `${context.prefix}${context.typedKey}:` +
      quoteValue(suggestion);

    const nextValue =
      value.slice(0, context.start) +
      replacement +
      value.slice(context.end);

    const nextCursor = context.start + replacement.length;

    onChange(nextValue);
    setCursor(nextCursor);
    setHighlighted(0);
    setDismissedToken(replacement);

    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleKeyDown(event) {
    if (!isOpen || !context) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted(
        (current) => (current + 1) % context.suggestions.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(
        (current) =>
          (current - 1 + context.suggestions.length) %
          context.suggestions.length
      );
      return;
    }

    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      chooseSuggestion(
        context.suggestions[
          Math.min(highlighted, context.suggestions.length - 1)
        ]
      );
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedToken(activeToken);
    }
  }

  return (
    <div className="query-input-shell">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          syncInput(event.target);
        }}
        onClick={(event) => syncInput(event.currentTarget)}
        onFocus={(event) => syncInput(event.currentTarget)}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (![
            "ArrowDown",
            "ArrowUp",
            "Enter",
            "Tab",
            "Escape",
          ].includes(event.key)) {
            syncInput(event.currentTarget);
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck="false"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="query-filter-suggestions"
      />

      {isOpen ? (
        <div
          id="query-filter-suggestions"
          className="query-suggestions terminal-frame"
          role="listbox"
        >
          <div className="query-suggestion-header">
            {context.canonicalKey.toUpperCase()} OPTIONS
          </div>

          {context.suggestions.map((suggestion, index) => (
            <button
              type="button"
              key={`${context.canonicalKey}-${suggestion}`}
              className={
                index === highlighted
                  ? "query-suggestion query-suggestion-active"
                  : "query-suggestion"
              }
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => chooseSuggestion(suggestion)}
              role="option"
              aria-selected={index === highlighted}
            >
              <span className="query-suggestion-key">
                {context.typedKey}:
              </span>
              <span>{quoteValue(suggestion)}</span>
            </button>
          ))}

          <div className="query-suggestion-help">
            ↑↓ SELECT // TAB OR ENTER ACCEPT // ESC CLOSE
          </div>
        </div>
      ) : null}
    </div>
  );
}
