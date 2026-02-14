// src/lib/loaders/readJsonFile.ts
import "server-only";

import { promises as fs } from "fs";
import path from "path";

export type ReadJsonOptions<T> = {
  /** relative to project root (process.cwd()) */
  relPath: string;
  /** Validate parsed JSON and return typed data */
  validate: (value: unknown, meta: { file: string }) => T;
  /** Cache parsed+validated data at module level (default true) */
  cache?: boolean;
};

const CACHE = new Map<string, unknown>();

export async function readJsonFile<T>(opts: ReadJsonOptions<T>): Promise<T> {
  const rel = String(opts.relPath ?? "").trim();
  if (!rel) throw new Error("readJsonFile: missing relPath");

  const file = path.join(process.cwd(), rel);

  const useCache = opts.cache !== false;
  if (useCache && CACHE.has(file)) {
    return CACHE.get(file) as T;
  }

  let raw: string;
  try {
    const buf = await fs.readFile(file);
    raw = buf.toString("utf8");
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (String(e?.code ?? "") === "ENOENT") {
      throw new Error(`JSON file not found: ${file}`);
    }
    throw new Error(`Failed to read JSON file ${file}: ${String(e?.message ?? err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const e = err as { message?: string };
    throw new Error(`Invalid JSON in ${file}: ${String(e?.message ?? err)}`);
  }

  const validated = opts.validate(parsed, { file });

  if (useCache) CACHE.set(file, validated as unknown);
  return validated;
}

/** Clear one cached file, or everything if no path is provided. */
export function clearJsonFileCache(relPath?: string): void {
  if (!relPath) {
    CACHE.clear();
    return;
  }
  const file = path.join(process.cwd(), String(relPath).trim());
  CACHE.delete(file);
}
