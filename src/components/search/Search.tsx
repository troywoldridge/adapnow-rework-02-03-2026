"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SearchProps = {
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

export default function Search({
  placeholder = "Search products…",
  autoFocus = false,
  className = "",
}: SearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/products?search=${encodeURIComponent(q)}`);
  };

  return (
    <section className={`search ${className}`.trim()} aria-label="Site search">
      <form onSubmit={onSubmit} className="search-box">
        <input
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={placeholder}
          className="w-full rounded-md border px-3 py-2"
          aria-label="Search products"
        />
      </form>
    </section>
  );
}
