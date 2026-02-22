// src/lib/cryptoPhone.ts
import "server-only";

import crypto from "node:crypto";

/**
 * Phone encryption helper (AES-256-GCM) with versioned envelopes + key rotation.
 *
 * Storage recommendation:
 * - Store encrypted phone as TEXT (base64url) in DB; easy to transport/log-safe.
 * - If you already store BYTEA/Buffer, we also support Buffer helpers.
 *
 * Env:
 * - PHONE_ENC_KEYS: comma/space/semicolon separated keys. First key = primary encrypt key.
 *   Example:
 *     PHONE_ENC_KEYS="k1_super_secret,k0_old_secret"
 *
 * Backwards compatibility:
 * - If PHONE_ENC_KEYS is not set, we fall back to PHONE_ENC_KEY, then "dev-key" for local dev.
 *
 * Format (binary):
 * [1 byte version][1 byte keyIdLen][keyId bytes][12 byte iv][16 byte tag][ciphertext...]
 *
 * We encode the binary envelope using base64url for DB/storage.
 */

const VERSION = 1;
const IV_LEN = 12; // recommended for GCM
const TAG_LEN = 16;

type KeySpec = {
  id: string; // small identifier derived from key material (not secret)
  key: Buffer; // 32 bytes
};

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function normalizeKeyMaterial(s?: string): string {
  return String(s ?? "").trim();
}

function parseKeysFromEnv(): string[] {
  const multi = normalizeKeyMaterial(process.env.PHONE_ENC_KEYS);
  if (multi) {
    return multi
      .split(/[,\s;]+/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const single = normalizeKeyMaterial(process.env.PHONE_ENC_KEY);
  if (single) return [single];

  // dev fallback (never rely on this in production)
  return ["dev-key"];
}

function deriveKeySpec(material: string): KeySpec {
  // Derive a stable 32-byte key from arbitrary string material
  const matBuf = Buffer.from(material, "utf8");
  const key = sha256(matBuf); // 32 bytes

  // Non-secret key id to help rotation; keep short to save space
  const id = sha256(key).subarray(0, 6).toString("hex"); // 12 chars
  return { id, key };
}

let _keys: KeySpec[] | null = null;
function getKeyring(): KeySpec[] {
  if (_keys) return _keys;
  const materials = parseKeysFromEnv();
  _keys = materials.map(deriveKeySpec);
  return _keys;
}

function getPrimaryKey(): KeySpec {
  const ring = getKeyring();
  if (!ring.length) throw new Error("No encryption keys configured");
  return ring[0];
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(s: string): Buffer {
  const raw = String(s ?? "").trim();
  if (!raw) throw new Error("Empty encrypted phone payload");

  const b64 = raw.replaceAll("-", "+").replaceAll("_", "/");
  // pad to length multiple of 4
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);

  return Buffer.from(padded, "base64");
}

/**
 * Very-light normalization:
 * - trims
 * - strips common separators
 * - preserves leading +
 * This is NOT a full E.164 validator (you can add libphonenumber later if needed).
 */
export function normalizePhone(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // Keep leading + if present, remove everything else that's not digit
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Encrypt a phone number into a base64url string envelope (DB-friendly).
 */
export async function encryptPhoneToString(plain: string): Promise<string> {
  const normalized = normalizePhone(plain);
  if (!normalized) throw new Error("Phone number is empty");

  const primary = getPrimaryKey();

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", primary.key, iv);

  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  const keyIdBytes = Buffer.from(primary.id, "utf8");
  if (keyIdBytes.length > 255) throw new Error("Key id too long");

  // [ver][keyIdLen][keyId][iv][tag][ciphertext]
  const header = Buffer.from([VERSION, keyIdBytes.length]);
  const packed = Buffer.concat([header, keyIdBytes, iv, tag, ciphertext]);

  return base64UrlEncode(packed);
}

/**
 * Decrypt a base64url envelope string back to a normalized phone string.
 */
export async function decryptPhoneFromString(enc: string): Promise<string> {
  const buf = base64UrlDecode(enc);
  return decryptPhoneFromBuffer(buf);
}

/**
 * Encrypt into raw Buffer (if your DB column is BYTEA).
 * Note: Prefer encryptPhoneToString for portability unless you specifically want BYTEA.
 */
export async function encryptPhone(plain: string): Promise<Buffer> {
  const s = await encryptPhoneToString(plain);
  return base64UrlDecode(s);
}

/**
 * Decrypt from raw Buffer (BYTEA) to normalized phone string.
 */
export async function decryptPhoneFromBuffer(packed: Buffer): Promise<string> {
  const b = Buffer.isBuffer(packed) ? packed : Buffer.from(packed);

  if (b.length < 2 + IV_LEN + TAG_LEN) {
    throw new Error("Encrypted phone payload too short");
  }

  const ver = b.readUInt8(0);
  if (ver !== VERSION) {
    throw new Error(`Unsupported encrypted phone version: ${ver}`);
  }

  const keyIdLen = b.readUInt8(1);
  const minLen = 2 + keyIdLen + IV_LEN + TAG_LEN;
  if (b.length < minLen) {
    throw new Error("Encrypted phone payload malformed");
  }

  const keyId = b.subarray(2, 2 + keyIdLen).toString("utf8");
  const ivStart = 2 + keyIdLen;
  const tagStart = ivStart + IV_LEN;
  const ctStart = tagStart + TAG_LEN;

  const iv = b.subarray(ivStart, ivStart + IV_LEN);
  const tag = b.subarray(tagStart, tagStart + TAG_LEN);
  const ciphertext = b.subarray(ctStart);

  const ring = getKeyring();

  // Try matching keyId first (fast path), otherwise try all keys.
  const ordered: KeySpec[] = [];
  const match = ring.find((k) => k.id === keyId);
  if (match) ordered.push(match);
  for (const k of ring) if (!match || k.id !== match.id) ordered.push(k);

  let lastErr: unknown = null;

  for (const ks of ordered) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", ks.key, iv);
      decipher.setAuthTag(tag);

      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      // Always return normalized form (what we encrypted)
      return plain;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }

  // If none worked, surface a controlled error (don’t leak details)
  throw new Error("Failed to decrypt phone (no keys matched or data corrupted)");
}

/**
 * Rotate helper: decrypt with any known key, then re-encrypt with primary key.
 * Use this when you want to migrate DB rows gradually.
 */
export async function reencryptPhone(enc: string): Promise<string> {
  const plain = await decryptPhoneFromString(enc);
  return encryptPhoneToString(plain);
}
