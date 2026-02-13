// src/lib/logger.ts
// Simple structured logger with timestamp, level, and optional requestId.
// Respects LOG_LEVEL env (debug | info | warn | error).

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

const configuredLevel = (() => {
  const raw = (typeof process !== "undefined" && process.env?.LOG_LEVEL) || "";
  const v = String(raw).trim().toLowerCase();
  const idx = LEVELS.indexOf(v as Level);
  return idx >= 0 ? (LEVELS[idx] as Level) : "info";
})();

function shouldLog(level: Level): boolean {
  const a = LEVELS.indexOf(level);
  const b = LEVELS.indexOf(configuredLevel);
  return a >= b;
}

function format(level: Level, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = { timestamp: ts, level, message };
  const merged = meta ? { ...base, ...meta } : base;
  return JSON.stringify(merged);
}

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const out = format(level, message, meta);
  if (level === "error") {
    console.error(out);
  } else if (level === "warn") {
    console.warn(out);
  } else {
    console.log(out);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};

/** Create a child logger that always includes requestId. */
export function withRequestId(requestId: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) =>
      logger.debug(msg, { ...meta, requestId }),
    info: (msg: string, meta?: Record<string, unknown>) =>
      logger.info(msg, { ...meta, requestId }),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      logger.warn(msg, { ...meta, requestId }),
    error: (msg: string, meta?: Record<string, unknown>) =>
      logger.error(msg, { ...meta, requestId }),
  };
}
