// src/lib/guides-sitemap.ts
import "server-only";

import type { MetadataRoute } from "next";
import path from "node:path";
import { promises as fsp } from "node:fs";

const GUIDES_ROOT = path.join(process.cwd(), "public", "guides");

type WalkEntry = { href: string; lastMod: Date };

function toPosixPath(p: string): string {
  // Ensure URL paths use forward slashes even on Windows
  return p.split(path.sep).join("/");
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fsp.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function walk(dirAbs: string, rel = ""): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];

  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fsp.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const e of entries) {
    if (!e?.name || e.name.startsWith(".")) continue;

    const abs = path.join(dirAbs, e.name);
    const relPath = path.posix.join(rel, toPosixPath(e.name));

    if (e.isDirectory()) {
      out.push(...(await walk(abs, relPath)));
      continue;
    }

    if (e.isFile() && /\.pdf$/i.test(e.name)) {
      try {
        const stat = await fsp.stat(abs);
        out.push({ href: `/guides/${relPath}`, lastMod: stat.mtime });
      } catch {
        // ignore unreadable files
      }
    }
  }

  return out;
}

function newestDate(dates: Date[], fallback: Date): Date {
  if (!dates.length) return fallback;
  let max = dates[0]!;
  for (const d of dates) {
    if (d.getTime() > max.getTime()) max = d;
  }
  return max;
}

export async function guidesSitemapEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  const base = String(baseUrl ?? "").replace(/\/+$/, "");
  const now = new Date();

  // If the folder doesn't exist, return just the /guides landing entry.
  const hasGuides = await dirExists(GUIDES_ROOT);
  if (!hasGuides) {
    return [
      {
        url: `${base}/guides`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      },
    ];
  }

  const files = await walk(GUIDES_ROOT);
  files.sort((a, b) => a.href.localeCompare(b.href));

  const landingLastMod = newestDate(files.map((f) => f.lastMod), now);

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/guides`,
      lastModified: landingLastMod,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  for (const f of files) {
    entries.push({
      url: `${base}${f.href}`,
      lastModified: f.lastMod,
      changeFrequency: "yearly",
      priority: 0.3,
    });
  }

  return entries;
}
