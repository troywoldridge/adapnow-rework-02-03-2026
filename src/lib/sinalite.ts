import "server-only";

type StoreLabel = "US" | "CA";
type StoreCode = "en_us" | "en_ca";

const DEFAULT_BASE_URL = "https://liveapi.sinalite.com";
const DEFAULT_AUDIENCE = "https://apiconnect.sinalite.com";

const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

export function normalizeStoreCode(input: unknown): StoreCode {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "en_us" || v === "us") return "en_us";
  if (v === "en_ca" || v === "ca") return "en_ca";
  // default to US
  return "en_us";
}

export function storeCodeToStoreLabel(code: StoreCode): StoreLabel {
  return code === "en_ca" ? "CA" : "US";
}

/**
 * Validate exactly 1 option per group.
 * Input is the "options list" from GET /product/{id}/{storeCode} (array 1),
 * and the selected optionIds.
 *
 * Returns a normalized payload:
 * - selections: Record<group, optionId>
 * - orderedChain: optionIds in stable group order (alphabetical by group)
 * - variantKey: sorted ascending option ids joined by '-'
 */
export function validateOnePerGroup(opts: {
  productId: number;
  storeCode: StoreCode;
  productOptions: Array<{ id: number; group?: string; name?: string }>;
  selectedOptionIds: number[];
}): {
  selections: Record<string, number>;
  orderedChain: number[];
  variantKey: string;
} {
  const { productOptions, selectedOptionIds } = opts;

  const selected = (selectedOptionIds || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!selected.length) {
    throw new Error("No options selected");
  }

  // optionId -> group
  const idToGroup = new Map<number, string>();
  // group -> [optionIds]
  const groupToIds = new Map<string, number[]>();

  for (const o of productOptions || []) {
    const id = Number((o as any)?.id);
    if (!Number.isFinite(id)) continue;
    const g = String((o as any)?.group ?? "").trim();
    if (!g) continue;

    idToGroup.set(id, g);
    const arr = groupToIds.get(g) || [];
    arr.push(id);
    groupToIds.set(g, arr);
  }

  // Ensure every selected option exists & belongs to a group
  const selections: Record<string, number> = {};
  for (const id of selected) {
    const g = idToGroup.get(id);
    if (!g) {
      throw new Error(`Selected optionId ${id} is not valid for this product/store`);
    }
    if (selections[g] != null) {
      throw new Error(`More than one option selected for group "${g}"`);
    }
    selections[g] = id;
  }

  // Also ensure we didn't miss a required group:
  // We only know "required" groups as those present in productOptions.
  // Many products have optional groups, so we can’t force all groups.
  // But we *can* enforce "one per group for groups you touched".
  // If you want to enforce specific required groups, do it in caller.

  // Stable group order: alphabetical (simple + deterministic)
  const groupsOrdered = Object.keys(selections).sort((a, b) => a.localeCompare(b));
  const orderedChain = groupsOrdered.map((g) => selections[g]);

  // Variant key matches /variants keys: sorted numeric ids joined by '-'
  const variantKey = [...orderedChain].sort((a, b) => a - b).join("-");

  return { selections, orderedChain, variantKey };
}

type SinaliteConfig = {
  baseUrl: string;
  authUrl: string;
  audience: string;
  clientId: string;
  clientSecret: string;
};

function getConfig(): SinaliteConfig {
  const baseUrl = (process.env.SINALITE_BASE_URL || process.env.SINALITE_API_BASE || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const authUrl = (process.env.SINALITE_AUTH_URL || `${baseUrl}/auth/token`).replace(/\/+$/, "");
  const audience = (process.env.SINALITE_AUDIENCE || DEFAULT_AUDIENCE).trim();

  return {
    baseUrl,
    authUrl,
    audience,
    clientId: requiredEnv("SINALITE_CLIENT_ID"),
    clientSecret: requiredEnv("SINALITE_CLIENT_SECRET"),
  };
}

async function fetchWithRetry(url: string, init: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (attempt < retries) {
          await sleep(waitMs);
          continue;
        }
      }

      return res;
    } catch (err: any) {
      clearTimeout(t);
      if (attempt >= retries) throw err;
      const waitMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(waitMs);
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

async function getAccessToken(): Promise<string> {
  const cfg = getConfig();

  const res = await fetchWithRetry(cfg.authUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      audience: cfg.audience,
      grant_type: "client_credentials",
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sinalite auth failed (${res.status}): ${text.slice(0, 250)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Sinalite auth returned non-JSON: ${text.slice(0, 250)}`);
  }

  const token = parsed?.access_token;
  if (!token) throw new Error("Sinalite auth missing access_token");
  return `Bearer ${token}`;
}

async function apiGet(path: string): Promise<any> {
  const cfg = getConfig();
  const token = await getAccessToken();
  const url = `${cfg.baseUrl}/${path.replace(/^\//, "")}`;

  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      authorization: token,
      accept: "application/json",
    },
  });

  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Sinalite GET ${path} failed (${res.status}): ${text.slice(0, 250)}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function apiPost(path: string, body: any): Promise<any> {
  const cfg = getConfig();
  const token = await getAccessToken();
  const url = `${cfg.baseUrl}/${path.replace(/^\//, "")}`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      authorization: token,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sinalite POST ${path} failed (${res.status}): ${text.slice(0, 250)}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

/**
 * Fetch the product option list + pricing hashes + metadata from GET /product/{id}/{storeCode}.
 * Returns the raw triple arrays and also a normalized `productOptions` array.
 */
export async function fetchSinaliteProductOptions(opts: {
  productId: number;
  storeCode: StoreCode;
}): Promise<{
  productOptions: Array<{ id: number; group?: string; name?: string }>;
  pricingRows: Array<{ hash: string; value: string }>;
  metadataRows: any[];
  raw: any;
}> {
  const pid = Number(opts.productId);
  if (!Number.isFinite(pid) || pid <= 0) throw new Error("productId must be a positive number");

  const storeCode = normalizeStoreCode(opts.storeCode);
  const payload = await apiGet(`product/${pid}/${storeCode}`);

  if (!payload) {
    return { productOptions: [], pricingRows: [], metadataRows: [], raw: payload };
  }

  const arr1 = Array.isArray(payload?.[0]) ? payload[0] : [];
  const arr2 = Array.isArray(payload?.[1]) ? payload[1] : [];
  const arr3 = Array.isArray(payload?.[2]) ? payload[2] : [];

  const productOptions = arr1.map((o: any) => ({
    id: Number(o?.id),
    group: o?.group != null ? String(o.group) : undefined,
    name: o?.name != null ? String(o.name) : undefined,
  }));

  const pricingRows = arr2
    .map((r: any) => ({
      hash: String(r?.hash ?? ""),
      value: String(r?.value ?? ""),
    }))
    .filter((r: any) => r.hash);

  return { productOptions, pricingRows, metadataRows: arr3, raw: payload };
}

/**
 * Live pricing via POST /price/{id}/{storeId}
 * Note: Sinalite docs say storeId is 6 (CA) / 9 (US). Your storeCode is en_ca/en_us.
 */
export async function priceSinaliteProduct(opts: {
  productId: number;
  storeCode: StoreCode;
  optionIds: number[];
}): Promise<{
  price: string | null;
  packageInfo: any | null;
  productOptions: any | null;
  raw: any;
}> {
  const pid = Number(opts.productId);
  if (!Number.isFinite(pid) || pid <= 0) throw new Error("productId must be a positive number");

  const storeCode = normalizeStoreCode(opts.storeCode);
  const storeId = storeCode === "en_ca" ? 6 : 9;

  const optionIds = (opts.optionIds || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!optionIds.length) throw new Error("optionIds is empty");

  const payload = await apiPost(`price/${pid}/${storeId}`, { productOptions: optionIds });

  return {
    price: payload?.price != null ? String(payload.price) : null,
    packageInfo: payload?.packageInfo ?? null,
    productOptions: payload?.productOptions ?? null,
    raw: payload,
  };
}
