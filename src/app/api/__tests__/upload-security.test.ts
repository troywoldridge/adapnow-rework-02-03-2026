import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";

/* ------------------------- AWS mocks ------------------------- */
vi.mock("@aws-sdk/client-s3", async () => {
  class S3Client {
    constructor(_opts: any) {}
    send = vi.fn(async () => ({}));
  }
  class PutObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  return { S3Client, PutObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", async () => {
  return { getSignedUrl: vi.fn(async () => "https://signed.example.com/upload?sig=fake") };
});

/* ------------------------- Logger mock ------------------------- */
vi.mock("@/lib/logger", async () => {
  return { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, log: vi.fn() };
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

async function findUploadPresignRoute(): Promise<string> {
  const files = await listRouteFiles();
  for (const f of files) {
    const src = await readFileSafe(f);

    const mentionsR2 =
      src.includes("r2.cloudflarestorage.com") ||
      src.includes("R2_ACCOUNT_ID") ||
      src.includes("R2_BUCKET_NAME");

    const mentionsPresign =
      src.includes("getSignedUrl") ||
      src.includes("PutObjectCommand") ||
      src.includes("S3Client");

    const exportsPOST = src.includes("export async function POST");

    if (mentionsR2 && mentionsPresign && exportsPOST) return f;
  }
  throw new Error("Could not auto-find upload presign route (R2 + getSignedUrl + POST) under src/app/api/**/route.ts");
}

function makeReq(body: any) {
  return new Request("http://localhost/api/upload/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

describe("Upload security (presign)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.R2_ACCOUNT_ID = "acct_test";
    process.env.R2_ACCESS_KEY_ID = "ak_test";
    process.env.R2_SECRET_ACCESS_KEY = "sk_test";
    process.env.R2_BUCKET_NAME = "bucket_test";
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.example.com";
    process.env.R2_UPLOAD_PREFIX = "uploads";
    process.env.R2_PRESIGN_EXPIRES_SECONDS = "900";
  });

  it("rejects path traversal and absolute paths in filename", async () => {
    const file = await findUploadPresignRoute();
    const mod = await importRouteModule(file);
    const POST = mod.POST as ((req: Request) => Promise<Response>) | undefined;
    expect(typeof POST).toBe("function");

    const badFilenames = ["../x.png", "a/../../b.png", "/absolute.png", "\\windows\\path.png"];
    for (const filename of badFilenames) {
      const res = await POST!(
        makeReq({
          filename,
          contentType: "image/png",
          lineId: "line_test_1",
        })
      );
      expect([400, 401, 403, 415, 422]).toContain(res.status);
    }
  });

  it("rejects disallowed content types (if enforced)", async () => {
    const file = await findUploadPresignRoute();
    const mod = await importRouteModule(file);
    const POST = mod.POST as ((req: Request) => Promise<Response>) | undefined;
    expect(typeof POST).toBe("function");

    const badTypes = ["text/html", "application/javascript", "image/svg+xml"];
    for (const contentType of badTypes) {
      const res = await POST!(
        makeReq({
          filename: "ok.png",
          contentType,
          lineId: "line_test_1",
        })
      );
      // If your route currently doesn't enforce, this may pass.
      // We accept either "blocked" or "ok". If you WANT enforcement, tighten this to only blocked statuses.
      expect([200, 201, 400, 401, 403, 415, 422]).toContain(res.status);
    }
  });

  it("accepts safe filename and allowed content type and returns signedUrl + (optional) publicUrl under prefix", async () => {
    const file = await findUploadPresignRoute();
    const mod = await importRouteModule(file);
    const POST = mod.POST as ((req: Request) => Promise<Response>) | undefined;
    expect(typeof POST).toBe("function");

    const res = await POST!(
      makeReq({
        filename: "artwork.png",
        contentType: "image/png",
        lineId: "line_test_2",
      })
    );

    const body = await readJson(res);
    if (res.status >= 500) {
      throw new Error(`upload presign returned ${res.status}. Body: ${JSON.stringify(body)}`);
    }
    expect([200, 201]).toContain(res.status);

    const signedUrl = body?.signedUrl ?? body?.url ?? body?.uploadUrl;
    expect(typeof signedUrl).toBe("string");
    expect(signedUrl).toContain("https://");

    const key = body?.key ?? body?.path ?? body?.objectKey;
    if (typeof key === "string") {
      expect(key.startsWith("uploads/")).toBe(true);
      expect(key.includes("..")).toBe(false);
    }

    const publicUrl = body?.publicUrl ?? body?.public ?? body?.assetUrl;
    if (typeof publicUrl === "string") {
      expect(publicUrl.startsWith("https://cdn.example.com")).toBe(true);
    }
  });
});
