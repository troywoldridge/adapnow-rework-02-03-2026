import { describe, it, expect, vi, beforeEach } from "vitest";

type AnyRecord = Record<string, any>;

const FIXED_EVENT_ID = "evt_test_replay_1";
const FIXED_PI_ID = "pi_test_1";

/* ------------------------- Stripe mock ------------------------- */
vi.mock("stripe", async () => {
  class StripeMock {
    webhooks = {
      constructEvent: vi.fn((_body: string | Buffer, _sig: string, _secret: string) => {
        return {
          id: FIXED_EVENT_ID,
          type: "payment_intent.succeeded",
          data: {
            object: {
              id: FIXED_PI_ID,
              metadata: { cartId: "cart_test_1" },
            },
          },
        };
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
 * DB mock: count "write-like" operations.
 * On replay, writes should not double.
 */
const dbWrites = {
  insert: 0,
  update: 0,
  execute: 0,
};

vi.mock("@/lib/db", async () => {
  const db = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(db)),

    // reads
    select: vi.fn(() => db),
    from: vi.fn(() => db),
    where: vi.fn(() => db),
    leftJoin: vi.fn(() => db),
    innerJoin: vi.fn(() => db),
    limit: vi.fn(async () => []),

    // writes
    insert: vi.fn(() => {
      dbWrites.insert += 1;
      return db;
    }),
    values: vi.fn(() => db),
    onConflictDoNothing: vi.fn(async () => ({})),
    onConflictDoUpdate: vi.fn(async () => ({})),

    update: vi.fn(() => {
      dbWrites.update += 1;
      return db;
    }),
    set: vi.fn(() => db),

    execute: vi.fn(async () => {
      dbWrites.execute += 1;
      return {};
    }),
  };

  return { db };
});

function makeReq(body: string, sig = "t=1,v1=fake") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": sig,
    },
    body,
  });
}

describe("Stripe webhook (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbWrites.insert = 0;
    dbWrites.update = 0;
    dbWrites.execute = 0;

    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_x";
  });

  it("replaying the same event id does not double-apply side effects (DB writes)", async () => {
    const mod = await import("../stripe/webhook/route");
    const POST = (mod as any).POST as (req: Request) => Promise<Response>;

    const payload = JSON.stringify({ hello: "world" });

    const res1 = await POST(makeReq(payload));
    expect(res1.status).toBe(200);

    const writesAfterFirst = { ...dbWrites };

    const res2 = await POST(makeReq(payload));
    expect(res2.status).toBe(200);

    // Replay should not double apply: DB writes should not increase materially.
    // Some implementations still do a harmless "check" query/execute; we focus on insert/update.
    expect(dbWrites.insert).toBe(writesAfterFirst.insert);
    expect(dbWrites.update).toBe(writesAfterFirst.update);
  });
});
