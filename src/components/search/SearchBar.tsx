"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type SearchBarProps = {
  /**
   * Base path to navigate to for search results.
   * Default: "/search" which expects query param "query".
   */
  actionPath?: string;

  /**
   * Query-string param name. Default: "query"
   */
  paramName?: string;

  /**
   * Placeholder text for the input.
   */
  placeholder?: string;

  /**
   * Accessible label for the input.
   */
  inputLabel?: string;

  /**
   * Optional initial value for the search input.
   */
  defaultValue?: string;

  /**
   * If true, focuses the input on mount.
   */
  autoFocus?: boolean;

  /**
   * If true, enables Cmd/Ctrl+K to focus the input.
   */
  enableHotkey?: boolean;

  /**
   * Optional CSS class applied to the form wrapper.
   */
  className?: string;
};

function buildSearchUrl(opts: {
  actionPath: string;
  paramName: string;
  query: string | null;
}): string {
  const { actionPath, paramName, query } = opts;

  const base = actionPath.startsWith("/") ? actionPath : `/${actionPath}`;
  if (!query) return base;

  const sp = new URLSearchParams();
  sp.set(paramName, query);
  return `${base}?${sp.toString()}`;
}

export default function SearchBar({
  actionPath = "/search",
  paramName = "query",
  placeholder = "Search products…",
  inputLabel = "Search products",
  defaultValue = "",
  autoFocus = false,
  enableHotkey = true,
  className = "",
}: SearchBarProps) {
  const router = useRouter();
  const inputId = useId();
  const [q, setQ] = useState(String(defaultValue ?? ""));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Optional: ⌘/Ctrl+K focuses search (ignores typing in other fields)
  useEffect(() => {
    if (!enableHotkey) return;

    const onKey = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase?.() ?? "";
      if (!(e.ctrlKey || e.metaKey) || key !== "k") return;

      // Avoid hijacking when user is actively typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase?.();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isEditable) return;

      e.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey as any);
  }, [enableHotkey]);

  // Optional autofocus
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const query = q.trim();
    const url = buildSearchUrl({
      actionPath,
      paramName,
      query: query.length ? query : null,
    });

    router.push(url);
  }

  return (
    <form
      role="search"
      aria-label="Site search"
      onSubmit={onSubmit}
      className={`searchbar ${className}`.trim()}
      autoComplete="off"
    >
      <label className="searchbar-label" htmlFor={inputId}>
        {inputLabel}
      </label>

      <div className="searchbar-row">
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          aria-label={inputLabel}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button type="submit" aria-label="Search">
          🔍
        </button>
      </div>
    </form>
  );
}
