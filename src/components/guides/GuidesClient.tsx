// src/components/guides/GuidesClient.tsx
"use client";

import * as React from "react";
import type { DirNode, FileNode } from "@/app/guides/page";

function formatBytes(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "—";
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / 1024 / 1024).toFixed(1)} MB`;
  return `${(x / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function safeText(v: unknown) {
  return String(v ?? "").trim();
}

function postGuideDownload(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);

    // Prefer sendBeacon for "fire-and-forget" reliability
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/analytics/guide-download", blob);
      if (ok) return;
    }

    // Fallback to fetch
    fetch("/api/analytics/guide-download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore analytics errors
  }
}

function TrackedPdfLink({ file, categoryPath }: { file: FileNode; categoryPath: string }) {
  const href = safeText(file?.href);

  const onClick = React.useCallback(() => {
    if (!href) return;

    postGuideDownload({
      href,
      label: safeText(file?.label),
      sizeBytes: Number(file?.sizeBytes) || 0,
      categoryPath: safeText(categoryPath),
      ts: Date.now(),
    });
  }, [href, file, categoryPath]);

  // If missing href, render inert text (avoid broken anchors)
  if (!href) {
    return <span className="guides__link guides__link--disabled">{safeText(file?.label) || "PDF"}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="guides__link"
    >
      {safeText(file?.label) || "PDF"}
    </a>
  );
}

function Section({ node, path }: { node: DirNode; path: string }) {
  const title = safeText(node?.title) || "Section";
  const nextPath = path ? `${path} / ${title}` : title;

  const files = Array.isArray(node?.files) ? node.files : [];
  const children = Array.isArray(node?.children) ? node.children : [];

  return (
    <details className="guides__section">
      <summary className="guides__summary">
        <span className="guides__summaryTitle">{title}</span>

        <span className="guides__summaryMeta" aria-hidden="true">
          {files.length ? `${files.length} PDF${files.length === 1 ? "" : "s"}` : "—"}
        </span>

        <svg
          className="guides__chev"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="guides__panel">
        {files.length > 0 && (
          <ul className="guides__fileList">
            {files.map((f) => (
              <li key={safeText(f.href) || safeText(f.label) || Math.random()} className="guides__fileRow">
                <div className="guides__fileMain">
                  <TrackedPdfLink file={f} categoryPath={nextPath} />
                </div>
                <span className="guides__pill" title={`${Number(f.sizeBytes) || 0} bytes`}>
                  PDF • {formatBytes(Number(f.sizeBytes) || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {children.length > 0 && (
          <div className="guides__children">
            {children.map((child) => (
              <Section key={`${nextPath}/${safeText(child.title)}`} node={child} path={nextPath} />
            ))}
          </div>
        )}

        {files.length === 0 && children.length === 0 && (
          <p className="guides__empty">No guides in this section yet.</p>
        )}
      </div>
    </details>
  );
}

type FlatRow = { file: FileNode; categoryPath: string };

function flatten(data: DirNode[]): FlatRow[] {
  const rows: FlatRow[] = [];

  const walk = (node: DirNode, path: string) => {
    const title = safeText(node?.title) || "Section";
    const nextPath = path ? `${path} / ${title}` : title;

    const files = Array.isArray(node?.files) ? node.files : [];
    for (const f of files) rows.push({ file: f, categoryPath: nextPath });

    const children = Array.isArray(node?.children) ? node.children : [];
    for (const c of children) walk(c, nextPath);
  };

  for (const d of data) walk(d, "");
  return rows;
}

export default function GuidesClient({ data }: { data: DirNode[] }) {
  const safeData = Array.isArray(data) ? data : [];
  const [q, setQ] = React.useState("");

  // Flatten once per data change
  const flat = React.useMemo(() => flatten(safeData), [safeData]);

  const results = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return flat;

    return flat.filter((r) => {
      const label = safeText(r.file?.label).toLowerCase();
      const cat = safeText(r.categoryPath).toLowerCase();
      const href = safeText(r.file?.href).toLowerCase();
      return label.includes(s) || cat.includes(s) || href.includes(s);
    });
  }, [flat, q]);

  const showSearch = q.trim().length > 0;

  return (
    <main className="guides">
      <div className="guides__card">
        <header className="guides__header">
          <h1 className="guides__title">Artwork Setup Guides</h1>
          <p className="guides__subtitle">
            Download PDF templates and follow the prep tips so your designs print perfectly.
          </p>

          <div className="guides__searchRow">
            <label className="guides__label" htmlFor="guides-q">
              Search guides
            </label>

            <div className="guides__searchControls" role="search" aria-label="Search guides">
              <input
                id="guides-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search guides… (e.g. Vinyl, 24 × 36, A-Frame)"
                className="guides__searchInput"
                autoComplete="off"
              />
              <button
                type="button"
                className="guides__clearBtn"
                onClick={() => setQ("")}
                disabled={!q}
                aria-disabled={!q}
                aria-label="Clear search"
                title="Clear"
              >
                ✕
              </button>

              <span className="guides__count" aria-live="polite">
                {showSearch ? `${results.length} match${results.length === 1 ? "" : "es"}` : `${flat.length} total`}
              </span>
            </div>
          </div>
        </header>

        {showSearch ? (
          <div className="guides__results">
            {results.length === 0 ? (
              <p className="guides__empty">No results.</p>
            ) : (
              <ul className="guides__resultsList">
                {results.map(({ file, categoryPath }) => {
                  const key = safeText(file.href) || `${safeText(file.label)}-${categoryPath}`;
                  return (
                    <li key={key} className="guides__resultRow">
                      <div className="guides__resultMain">
                        <div className="guides__resultTitle">
                          <TrackedPdfLink file={file} categoryPath={categoryPath} />
                        </div>
                        <div className="guides__resultPath">{safeText(categoryPath)}</div>
                      </div>
                      <span className="guides__pill">
                        PDF • {formatBytes(Number(file.sizeBytes) || 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="guides__tree">
            {safeData.length ? (
              safeData.map((node) => <Section key={safeText(node.title)} node={node} path="" />)
            ) : (
              <p className="guides__empty">No guides available yet.</p>
            )}
          </div>
        )}

        <footer className="guides__footer">
          Served via Cloudflare CDN. Guide structure mirrors product categories per the Sinalite API documentation.
        </footer>
      </div>
    </main>
  );
}
