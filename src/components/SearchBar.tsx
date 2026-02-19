"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  placeholder?: string;
  initialQuery?: string;
  className?: string;
  actionLabel?: string;
  /** If provided, we navigate to `${targetBase}?q=...` */
  targetBase?: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function SearchBar({
  placeholder = "Search…",
  initialQuery = "",
  className,
  actionLabel = "Search",
  targetBase = "/search",
}: Props) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQuery);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    // Navigate even on empty to keep behavior predictable
    const url = v ? `${targetBase}?q=${encodeURIComponent(v)}` : targetBase;
    router.push(url);
  }

  return (
    <form onSubmit={onSubmit} className={cx("w-full", className)}>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="site-search">
          Search
        </label>

        <input
          id="site-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className={cx(
            "w-full rounded-md border px-3 py-2 text-sm outline-none",
            "focus:ring-2 focus:ring-black/20"
          )}
          inputMode="search"
          autoComplete="off"
          aria-label="Search"
        />

        <button
          type="submit"
          className={cx(
            "rounded-md border px-3 py-2 text-sm font-medium",
            "hover:bg-black/5 active:bg-black/10"
          )}
          aria-label={actionLabel}
        >
          {actionLabel}
        </button>
      </div>
    </form>
  );
}
