import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";

type AnyRecord = Record<string, any>;

let capturedStripeAmount: number | null = null;

/* ------------------------- Stripe mock ------------------------- */
vi.mock("stripe", async () => {
  class StripeMock {
    paymentIntents = {
      create: vi.fn(async (args: AnyRecord) => {
        capturedStripeAmount = Number(args?.amount ?? 0);
        return { id: "pi_test_123", client_secret: "pi_secret_test_123" };
      }),
    };
    constructor(_key: string, _opts: AnyRecord) {}
  }
  return { default: StripeMock };
});

/* ------------------------- Logger mock ------------------------- */
vi.mock("@/lib/logger", async () => {
  return { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, log: vi.fn() };
});

/**
 * IMPORTANT:
 * Many of your endpoints use Drizzle db; for parity we only need totals to be computed,
 * not actually persisted. So we mock db to prevent real DB access causing 500s.
 */
vi.mock("@/lib/db", async () => {
  const db = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(db)),
    select: vi.fn(() => db),
    from: vi.fn(() => db),
    where: vi.fn(() => db),
    leftJoin: vi.fn(() => db),
    innerJoin: vi.fn(() => db),
    limit: vi.fn(async () => []),
    execute: vi.fn(async () => ({})),
    insert: vi.fn(() => db),
    values: vi.fn(() => db),
    onConflictDoUpdate: vi.fn(async () => ({})),
    onConflictDoNothing: vi.fn(async () => ({})),
    update: vi.fn(() => db),
    set: vi.fn(() => db),
  };
  return { db };
});

/* Credits helper (if used) */
vi.mock("@/lib/cartCredits", async () => {
  return { getCartCreditsCents: vi.fn(async () => 250) }; // $2.50
});

async function listRouteFiles(): Promise<string[]> {
  const root = path.join(process.cwd(), "src", "app", "api");
  async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (e.isFile() && e.name === "route.ts") out.push(p);
    }
    return out;
  }
  return walk(root).catch(() => []);
}

async function readFileSafe(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

async function importRouteModule(p: string): Promise<any> {
  return import(pathToFileURL(p).href);
}

function makeJsonReq(url: string, body: any, headers?: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
  });
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function firstNumber(...vals: any[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function findCreatePaymentIntentRoute(): Promise<string> {
  const files = await listRouteFiles();
  for (const f of files) {
    const src = await readFileSafe(f);
    // heuristics: mentions PaymentIntent or "create-payment-intent" in path
    if (f.includes(`${path.sep}create-payment-intent${path.sep}`)) return f;
    if (src.includes("paymentIntents") || src.includes("PaymentIntent")) {
      // narrow to POST handlers to reduce false positives
      if (src.includes("export async function POST")) return f;
    }
  }
  throw new Error("Could not auto-find create-payment-intent route under src/app/api/**/route.ts");
}

describe("Checkout totals parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedStripeAmount = null;

    // Env contract likely required by your route(s)
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_x";
    process.env.NEXT_PUBLIC_STORE_CODE = process.env.NEXT_PUBLIC_STORE_CODE || "en_us";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/db";
  });

  it("payment intent amount equals (subtotal + shipping + tax - credits)", async () => {
    const routeFile = await findCreatePaymentIntentRoute();
    const mod = await importRouteModule(routeFile);
    const POST = mod.POST as ((req: Request) => Promise<Response>) | undefined;
    expect(typeof POST).toBe("function");

    const cartId = "cart_test_1";

    // We don't depend on a shipping endpoint existing.
    // We send a shipping selection the PI endpoint can use (or ignore).
    const res = await POST!(
      makeJsonReq("http://localhost/api/create-payment-intent", {
        cartId,
        shipping: {
          country: "US",
          state: "NY",
          zip: "10001",
          carrier: "test",
          method: "test",
          costCents: 499, // $4.99
          currency: "USD",
        },
      })
    );

    // If the route returns 500, we want the body for debugging while still failing loudly.
    const body = await safeJson(res);
    if (res.status >= 500) {
      throw new Error(
        `create-payment-intent returned ${res.status}. Body: ${JSON.stringify(body)}`
      );
    }

    // Pull totals from common shapes
    const t = body?.totals ?? body ?? {};
    const subtotalCents = firstNumber(t.subtotalCents, body?.subtotalCents);
    const shippingCents = firstNumber(t.shippingCents, body?.shippingCents, 499);
    const taxCents = firstNumber(t.taxCents, body?.taxCents);
    const creditsCents = firstNumber(t.creditsCents, body?.creditsCents, 250);

    const expectedTotal = subtotalCents + shippingCents + taxCents - creditsCents;

    expect(typeof capturedStripeAmount).toBe("number");
    expect(capturedStripeAmount).toBe(expectedTotal);
  });
});
