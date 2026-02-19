// src/app/api/orders/[id]/invoice/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";

// PDF generation (Node)
import PDFDocument from "pdfkit";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { cartLines } from "@/lib/db/schema/cartLines";

// Cloudflare Images URL builder (your project helper)
import { cfImage } from "@/lib/cfImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderRow = typeof orders.$inferSelect;

type LineRow = {
  id: string;
  productId: number | string;
  quantity: number | string;
  unitPriceCents: number | string | null;
  lineTotalCents: number | string | null;
  optionIds: (number | string)[] | null;
};

type SinaliteProductRow = {
  product_id: number;
  name: string | null;
  sku: string | null;
  category?: string | null;
  enabled?: boolean | null;
};

type AddressRow = {
  id: string;
  customer_id: string;
  label: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone_last4: string | null;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default_shipping: boolean;
  is_default_billing: boolean;
  deleted_at: string | null;
};

type SinaliteProductOptionRow = {
  product_id: number;
  store_code: string;
  option_id: number;
  option_group: string;
  option_name: string;
};

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function safeLower(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function moneyFmt(cents: number, currency: "USD" | "CAD") {
  const dollars = (Number(cents) || 0) / 100;
  const locale = currency === "CAD" ? "en-CA" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(dollars);
}

function niceDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function clampText(s: unknown, max = 120): string {
  const v = String(s ?? "").trim();
  if (!v) return "";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
}

function normalizeIntList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function safeOrderEmail(order: any): string | null {
  const candidates = [
    order?.email,
    order?.customerEmail,
    order?.billingEmail,
    order?.shippingEmail,
  ].map((x: any) => String(x ?? "").trim());

  const found = candidates.find((x) => x.includes("@"));
  return found || null;
}

function safeOrderName(order: any): string | null {
  const candidates = [
    order?.name,
    order?.customerName,
    order?.billingName,
    order?.shippingName,
    order?.fullName,
  ].map((x: any) => String(x ?? "").trim());

  const found = candidates.find(Boolean);
  return found || null;
}

function safePhoneFromAddress(a: AddressRow | null): string | null {
  if (!a) return null;
  const last4 = String(a.phone_last4 ?? "").trim();
  if (!last4) return null;
  return `***-***-${last4}`;
}

/* ------------------------------ store code ------------------------------ */
function resolveStoreCode(order: any): string {
  const fromOrder =
    String(order?.storeCode ?? order?.store_code ?? "").trim() ||
    "";

  const fromEnv =
    readEnv("NEXT_PUBLIC_STORE_CODE") ||
    readEnv("STORE_CODE") ||
    "";

  const store = (fromOrder || fromEnv || "").trim();

  // SinaLite codes are often "6" / "9" etc. Keep as text.
  return store || "9";
}

/* ------------------------------ DB: sinalite_products lookup ------------------------------ */
async function loadSinaliteProductsByIds(productIds: number[]): Promise<Map<number, SinaliteProductRow>> {
  const ids = Array.from(new Set(productIds.filter((n) => Number.isFinite(n) && n > 0)));
  const map = new Map<number, SinaliteProductRow>();
  if (!ids.length) return map;

  const res = (await db.execute(
    sql`SELECT product_id, name, sku, category, enabled
        FROM sinalite_products
        WHERE product_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
  )) as any;

  const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];

  for (const r of rows) {
    const pid = Number(r?.product_id);
    if (!Number.isFinite(pid)) continue;
    map.set(pid, {
      product_id: pid,
      name: r?.name ?? null,
      sku: r?.sku ?? null,
      category: r?.category ?? null,
      enabled: typeof r?.enabled === "boolean" ? r.enabled : null,
    });
  }

  return map;
}

/* ------------------------------ DB: customer_addresses lookup ------------------------------ */
async function loadAddressById(id: string): Promise<AddressRow | null> {
  const addrId = cleanId(id);
  if (!addrId) return null;

  try {
    const res = (await db.execute(
      sql`SELECT
            id::text,
            customer_id::text,
            label,
            first_name,
            last_name,
            company,
            email::text,
            phone_last4,
            street1,
            street2,
            city,
            state,
            postal_code,
            country,
            is_default_shipping,
            is_default_billing,
            deleted_at::text
          FROM customer_addresses
          WHERE id = ${addrId}::uuid
          LIMIT 1`
    )) as any;

    const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
    const r = rows[0];
    if (!r) return null;
    if (r.deleted_at) return null;

    return {
      id: String(r.id),
      customer_id: String(r.customer_id),
      label: r.label ?? null,
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      company: r.company ?? null,
      email: r.email ?? null,
      phone_last4: r.phone_last4 ?? null,
      street1: String(r.street1),
      street2: r.street2 ?? null,
      city: String(r.city),
      state: String(r.state),
      postal_code: String(r.postal_code),
      country: String(r.country),
      is_default_shipping: Boolean(r.is_default_shipping),
      is_default_billing: Boolean(r.is_default_billing),
      deleted_at: r.deleted_at ?? null,
    };
  } catch {
    return null;
  }
}

async function loadDefaultAddress(customerId: string, kind: "shipping" | "billing"): Promise<AddressRow | null> {
  const cid = cleanId(customerId);
  if (!cid) return null;

  const flag = kind === "shipping" ? sql`is_default_shipping = true` : sql`is_default_billing = true`;

  try {
    const res = (await db.execute(
      sql`SELECT
            id::text,
            customer_id::text,
            label,
            first_name,
            last_name,
            company,
            email::text,
            phone_last4,
            street1,
            street2,
            city,
            state,
            postal_code,
            country,
            is_default_shipping,
            is_default_billing,
            deleted_at::text
          FROM customer_addresses
          WHERE customer_id = ${cid}::uuid
            AND deleted_at IS NULL
            AND ${flag}
          ORDER BY sort_order ASC, updated_at DESC
          LIMIT 1`
    )) as any;

    const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
    const r = rows[0];
    if (!r) return null;

    return {
      id: String(r.id),
      customer_id: String(r.customer_id),
      label: r.label ?? null,
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      company: r.company ?? null,
      email: r.email ?? null,
      phone_last4: r.phone_last4 ?? null,
      street1: String(r.street1),
      street2: r.street2 ?? null,
      city: String(r.city),
      state: String(r.state),
      postal_code: String(r.postal_code),
      country: String(r.country),
      is_default_shipping: Boolean(r.is_default_shipping),
      is_default_billing: Boolean(r.is_default_billing),
      deleted_at: r.deleted_at ?? null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------ DB: sinalite_product_options lookup ------------------------------ */
function optKey(productId: number, storeCode: string, optionId: number): string {
  return `${productId}|${storeCode}|${optionId}`;
}

async function loadSinaliteOptionLabelsForLines(args: {
  storeCode: string;
  lines: Array<{ productId: number; optionIds: number[] }>;
}): Promise<Map<string, SinaliteProductOptionRow>> {
  const storeCode = String(args.storeCode || "").trim();
  const map = new Map<string, SinaliteProductOptionRow>();
  if (!storeCode) return map;

  const pairs: Array<{ productId: number; optionId: number }> = [];

  for (const l of args.lines) {
    const pid = Number(l.productId);
    if (!Number.isFinite(pid) || pid <= 0) continue;

    for (const oid of l.optionIds) {
      const id = Number(oid);
      if (!Number.isFinite(id) || id <= 0) continue;
      pairs.push({ productId: pid, optionId: id });
    }
  }

  if (!pairs.length) return map;

  // De-dupe pairs
  const uniq = new Map<string, { productId: number; optionId: number }>();
  for (const p of pairs) {
    const k = `${p.productId}|${p.optionId}`;
    if (!uniq.has(k)) uniq.set(k, p);
  }

  const uniqPairs = Array.from(uniq.values());

  // Build WHERE (product_id = X AND option_id = Y) OR ...
  // Constrain by store_code for index usage.
  const ors = uniqPairs.map((p) => sql`(product_id = ${p.productId} AND option_id = ${p.optionId})`);

  try {
    const res = (await db.execute(
      sql`SELECT product_id, store_code, option_id, option_group, option_name
          FROM sinalite_product_options
          WHERE store_code = ${storeCode}
            AND (${sql.join(ors, sql` OR `)})`
    )) as any;

    const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];

    for (const r of rows) {
      const pid = Number(r?.product_id);
      const oid = Number(r?.option_id);
      const sc = String(r?.store_code ?? "").trim();
      if (!Number.isFinite(pid) || !Number.isFinite(oid) || !sc) continue;

      map.set(optKey(pid, sc, oid), {
        product_id: pid,
        store_code: sc,
        option_id: oid,
        option_group: String(r?.option_group ?? ""),
        option_name: String(r?.option_name ?? ""),
      });
    }
  } catch {
    // ignore; invoice still works with IDs
  }

  return map;
}

/* ------------------------------ ownership loader ------------------------------ */
async function loadOrderForInvoicePdf(orderIdRaw: string): Promise<{
  order: OrderRow;
  lines: LineRow[];
  currency: "USD" | "CAD";
} | null> {
  const orderId = cleanId(orderIdRaw);
  if (!orderId) return null;

  const { userId } = await auth();

  const jar = await cookies();
  const sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;

  const order =
    ((await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))?.[0] as
      | OrderRow
      | undefined) ?? null;

  if (!order) return null;

  const owner = String((order as any).userId ?? "");

  // Guest → user claim
  if (userId && sid && owner === String(sid)) {
    await db.update(orders).set({ userId }).where(eq(orders.id, orderId));
    (order as any).userId = userId;
  }

  // Ownership check after potential claim
  const updatedOwner = String((order as any).userId ?? "");
  const claimants = [userId, sid].filter(Boolean).map(String);
  if (!claimants.includes(updatedOwner)) return null;

  const cartId = cleanId((order as any).cartId as string | null);
  const lines: LineRow[] = cartId
    ? ((await db
        .select({
          id: cartLines.id,
          productId: cartLines.productId,
          quantity: cartLines.quantity,
          unitPriceCents: cartLines.unitPriceCents,
          lineTotalCents: cartLines.lineTotalCents,
          optionIds: cartLines.optionIds,
        })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartId))) as unknown as LineRow[])
    : [];

  const currency: "USD" | "CAD" = (order as any).currency === "CAD" ? "CAD" : "USD";

  return { order, lines, currency };
}

/* ------------------------------ logo fetch (safe) ------------------------------ */
type CachedLogo = { key: string; buf: Buffer } | null;

declare global {
  // eslint-disable-next-line no-var
  var __adapInvoiceLogoCache: CachedLogo | undefined;
}

async function fetchLogoBuffer(): Promise<Buffer | null> {
  const logoId =
    readEnv("NEXT_PUBLIC_CF_LOGO_ID") ||
    readEnv("CF_LOGO_ID") ||
    null;

  if (!logoId) return null;

  const base =
    cfImage(logoId, "public") ||
    cfImage(logoId, "logo") ||
    cfImage(logoId, "productThumb") ||
    "";

  if (!base) return null;

  const url = base.includes("?") ? `${base}&format=png` : `${base}?format=png`;

  const cacheKey = `${logoId}|${url}`;
  if (globalThis.__adapInvoiceLogoCache?.key === cacheKey) return globalThis.__adapInvoiceLogoCache.buf;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    const isSupported = ct.includes("png") || ct.includes("jpeg") || ct.includes("jpg");
    if (!isSupported) return null;

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length < 256) return null;

    globalThis.__adapInvoiceLogoCache = { key: cacheKey, buf };
    return buf;
  } catch {
    return null;
  }
}

/* ------------------------------ pdf helpers ------------------------------ */
function bufferFromPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, left: 54, right: 54, bottom: 54 },
      info: {
        Title: "Invoice",
        Author: readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    build(doc);
    doc.end();
  });
}

function drawHr(doc: PDFKit.PDFDocument, y: number) {
  doc
    .save()
    .moveTo(54, y)
    .lineTo(612 - 54, y)
    .lineWidth(1)
    .strokeColor("#e5e7eb")
    .stroke()
    .restore();
}

function drawPill(doc: PDFKit.PDFDocument, x: number, y: number, text: string) {
  const t = clampText(text, 34);
  doc.save();
  doc.font("Helvetica-Bold").fontSize(9);
  const w = doc.widthOfString(t) + 14;
  const h = 18;
  doc.roundedRect(x, y, w, h, 9).fillAndStroke("#f3f4f6", "#e5e7eb");
  doc.fillColor("#111827").text(t, x + 7, y + 5);
  doc.restore();
}

function footer(doc: PDFKit.PDFDocument, brand: string, supportEmail: string, supportPhone: string) {
  const left = 54;
  const right = 612 - 54;
  const y = doc.page.height - 46;

  const pageNo = (doc as any).page?.number ? Number((doc as any).page.number) : 1;

  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
  doc.text(`${brand} • ${supportEmail}${supportPhone ? ` • ${supportPhone}` : ""}`, left, y, {
    width: right - left,
    align: "left",
  });
  doc.text(`Page ${pageNo}`, left, y, { width: right - left, align: "right" });
  doc.restore();
}

function formatAddressLines(a: AddressRow | null): string[] {
  if (!a) return ["—"];

  const nameParts = [a.first_name, a.last_name].map((x) => String(x ?? "").trim()).filter(Boolean);
  const name = nameParts.join(" ");
  const company = String(a.company ?? "").trim();
  const line1 = String(a.street1 ?? "").trim();
  const line2 = String(a.street2 ?? "").trim();
  const city = String(a.city ?? "").trim();
  const state = String(a.state ?? "").trim();
  const postal = String(a.postal_code ?? "").trim();
  const country = String(a.country ?? "").trim();

  const out: string[] = [];
  if (name) out.push(name);
  if (company) out.push(company);
  if (line1) out.push(line1);
  if (line2) out.push(line2);

  const cityLine = [city, state, postal].filter(Boolean).join(", ").replace(", ,", ",").trim();
  if (cityLine) out.push(cityLine);
  if (country) out.push(country);

  const email = String(a.email ?? "").trim();
  if (email && email.includes("@")) out.push(email);

  const phone = safePhoneFromAddress(a);
  if (phone) out.push(phone);

  return out.length ? out : ["—"];
}

function drawAddressBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  a: AddressRow | null
) {
  doc.roundedRect(x, y, w, 92, 12).fillAndStroke("#ffffff", "#e5e7eb");
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(title, x + 12, y + 10);

  const lines = formatAddressLines(a);
  doc.font("Helvetica").fontSize(9).fillColor("#374151");

  let yy = y + 26;
  for (const line of lines.slice(0, 6)) {
    doc.text(clampText(line, 60), x + 12, yy, { width: w - 24 });
    yy += 14;
  }
}

/* ------------------------------ route ------------------------------ */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const orderId = cleanId(params?.id);
  if (!orderId) return NextResponse.json({ ok: false, error: "Missing order id" }, { status: 400 });

  try {
    const loaded = await loadOrderForInvoicePdf(orderId);
    if (!loaded) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const { order, lines, currency } = loaded;

    const brand = readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing";
    const siteUrl = (readEnv("NEXT_PUBLIC_SITE_URL") || readEnv("SITE_URL") || "").replace(/\/+$/, "");

    const supportEmail =
      readEnv("SUPPORT_EMAIL") ||
      readEnv("NEXT_PUBLIC_SUPPORT_EMAIL") ||
      "support@adap.com";

    const supportPhone =
      readEnv("SUPPORT_PHONE") ||
      readEnv("NEXT_PUBLIC_SUPPORT_PHONE") ||
      "";

    const storeCode = resolveStoreCode(order as any);

    const orderNumber = (order as any).orderNumber ? String((order as any).orderNumber) : null;
    const placedAt = (order as any).placedAt ?? (order as any).createdAt ?? null;

    const status = safeLower((order as any).status || "placed");
    const paymentStatus = String((order as any).paymentStatus ?? "").trim();

    const subtotalCents = Number((order as any).subtotalCents) || 0;
    const shippingCents = Number((order as any).shippingCents) || 0;
    const taxCents = Number((order as any).taxCents) || 0;
    const creditsCents = Number((order as any).creditsCents ?? 0);
    const totalCents = Number((order as any).totalCents) || 0;

    // Product names/SKUs
    const productIds = lines.map((l) => Number(l.productId)).filter((n) => Number.isFinite(n) && n > 0);
    const sinaliteProducts = await loadSinaliteProductsByIds(productIds);

    // Option labels by product + store + option id
    const lineSpecs = lines.map((l) => ({
      productId: Number(l.productId),
      optionIds: normalizeIntList(l.optionIds),
    }));
    const optionLabelMap = await loadSinaliteOptionLabelsForLines({
      storeCode,
      lines: lineSpecs.filter((x) => Number.isFinite(x.productId) && x.productId > 0 && x.optionIds.length > 0),
    });

    // Addresses
    const billingAddressId = cleanId((order as any).billingAddressId ?? "");
    const shippingAddressId = cleanId((order as any).shippingAddressId ?? "");
    const customerId = cleanId((order as any).customerId ?? "");

    let billingAddress: AddressRow | null = null;
    let shippingAddress: AddressRow | null = null;

    if (billingAddressId) billingAddress = await loadAddressById(billingAddressId);
    if (shippingAddressId) shippingAddress = await loadAddressById(shippingAddressId);

    if (!billingAddress && customerId) billingAddress = await loadDefaultAddress(customerId, "billing");
    if (!shippingAddress && customerId) shippingAddress = await loadDefaultAddress(customerId, "shipping");

    // Logo embed attempt
    const logoBuf = await fetchLogoBuffer();

    const pdf = await bufferFromPdf((doc) => {
      const pageWidth = 612;
      const left = 54;
      const right = pageWidth - 54;

      const headerOrder = orderNumber ? `Order #${orderNumber}` : `Order ${orderId.slice(0, 8)}`;
      const dateStr = niceDate(String(placedAt || "")) || "—";

      const customerName = safeOrderName(order as any);
      const customerEmail = safeOrderEmail(order as any);

      const drawHeader = () => {
        doc.save();
        doc.roundedRect(left, 44, right - left, 86, 14).fillAndStroke("#ffffff", "#e5e7eb");
        doc.restore();

        if (logoBuf) {
          try {
            doc.image(logoBuf, left + 14, 58, { height: 38 });
          } catch {
            // ignore
          }
        }

        doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827");
        doc.text(brand, logoBuf ? left + 184 : left + 14, 58, { width: (right - left) - 28 });

        doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
        doc.text(siteUrl || " ", logoBuf ? left + 184 : left + 14, 78, { width: (right - left) - 28 });

        doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827");
        doc.text("INVOICE", left, 60, { width: right - left - 14, align: "right" });

        doc.font("Helvetica").fontSize(9).fillColor("#374151");
        doc.text(headerOrder, left, 78, { width: right - left - 14, align: "right" });
        doc.text(`Placed: ${dateStr}`, left, 92, { width: right - left - 14, align: "right" });

        const pillY = 110;
        let pillX = left + 14;

        drawPill(doc, pillX, pillY, `Store: ${storeCode}`);
        pillX += 110;

        drawPill(doc, pillX, pillY, `Currency: ${currency}`);
        pillX += 134;

        drawPill(doc, pillX, pillY, `Status: ${clampText(status || "placed", 18)}`);
        pillX += 134;

        if (paymentStatus) drawPill(doc, pillX, pillY, `Payment: ${clampText(paymentStatus, 18)}`);
      };

      const onPage = () => footer(doc, brand, supportEmail, supportPhone);

      drawHeader();

      // Customer block
      let y = 148;

      doc.roundedRect(left, y, right - left, 58, 12).fillAndStroke("#f9fafb", "#e5e7eb");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Customer", left + 14, y + 12);
      doc.font("Helvetica").fontSize(9).fillColor("#374151");
      doc.text(customerName ? clampText(customerName, 60) : "—", left + 14, y + 26, { width: 260 });
      doc.text(customerEmail ? clampText(customerEmail, 70) : "—", left + 14, y + 40, { width: 260 });

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Totals", left + 320, y + 12);
      doc.font("Helvetica").fontSize(9).fillColor("#374151");
      doc.text(`Subtotal: ${moneyFmt(subtotalCents, currency)}`, left + 320, y + 26);
      doc.text(`Shipping: ${moneyFmt(shippingCents, currency)}`, left + 320, y + 38);

      // Address boxes
      y = y + 74;
      const boxW = (right - left - 12) / 2;

      drawAddressBox(doc, left, y, boxW, "Billing Address", billingAddress);
      drawAddressBox(doc, left + boxW + 12, y, boxW, "Shipping Address", shippingAddress);

      // Items header
      y = y + 112;
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Items", left, y);
      y += 14;

      drawHr(doc, y);
      y += 8;

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280");
      doc.text("Product", left, y, { width: 320 });
      doc.text("Qty", left + 330, y, { width: 36, align: "right" });
      doc.text("Unit", left + 376, y, { width: 90, align: "right" });
      doc.text("Total", left + 476, y, { width: right - (left + 476), align: "right" });

      y += 16;
      drawHr(doc, y);
      y += 12;

      const ensurePageRoom = (needed: number) => {
        const bottom = doc.page.height - 72;
        if (y + needed <= bottom) return;

        onPage();
        doc.addPage();
        drawHeader();

        y = 148;
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Items (continued)", left, y);
        y += 14;

        drawHr(doc, y);
        y += 8;

        doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280");
        doc.text("Product", left, y, { width: 320 });
        doc.text("Qty", left + 330, y, { width: 36, align: "right" });
        doc.text("Unit", left + 376, y, { width: 90, align: "right" });
        doc.text("Total", left + 476, y, { width: right - (left + 476), align: "right" });

        y += 16;
        drawHr(doc, y);
        y += 12;
      };

      for (const l of lines) {
        const pidNum = Number(l.productId);
        const lookup = Number.isFinite(pidNum) ? sinaliteProducts.get(pidNum) : undefined;

        const name =
          (lookup?.name && String(lookup.name).trim()) ||
          (Number.isFinite(pidNum) ? `Product ${pidNum}` : `Product ${clampText(l.productId, 24)}`);

        const sku = (lookup?.sku && String(lookup.sku).trim()) || null;

        const qty = Math.max(0, Number(l.quantity ?? 0) || 0);
        const unit = Math.max(0, Number(l.unitPriceCents ?? 0) || 0);

        const providedLineTotal = Number(l.lineTotalCents);
        const computedLineTotal = unit * qty;
        const lineTotal = Number.isFinite(providedLineTotal) ? providedLineTotal : computedLineTotal;

        const optIds = normalizeIntList(l.optionIds);

        const optPretty = optIds
          .map((id) => {
            if (!Number.isFinite(pidNum) || pidNum <= 0) return String(id);
            const row = optionLabelMap.get(optKey(pidNum, storeCode, id));
            if (!row) return String(id);

            const grp = String(row.option_group ?? "").trim();
            const nm = String(row.option_name ?? "").trim();

            if (grp && nm) return `${grp}: ${nm}`;
            if (nm) return nm;
            return String(id);
          })
          .filter(Boolean);

        const needs = optPretty.length ? 58 : 30;
        ensurePageRoom(needs);

        doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
        doc.text(clampText(name, 72), left, y, { width: 320 });

        doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
        const meta: string[] = [];
        if (sku) meta.push(`SKU: ${clampText(sku, 40)}`);
        if (Number.isFinite(pidNum)) meta.push(`ID: ${pidNum}`);
        if (meta.length) doc.text(meta.join(" • "), left, y + 12, { width: 320 });

        if (optPretty.length) {
          // Make this readable and avoid one mega-line.
          const joined = optPretty.slice(0, 14).join(" • ");
          doc.text(`Options: ${clampText(joined, 120)}${optPretty.length > 14 ? " …" : ""}`, left, y + 22, { width: 320 });
          doc.font("Helvetica").fontSize(7).fillColor("#9ca3af");
          doc.text("Option labels sourced from sinalite_product_options.", left, y + 36, { width: 320 });
          doc.font("Helvetica").fontSize(10).fillColor("#111827");
        }

        doc.font("Helvetica").fontSize(10).fillColor("#111827");
        doc.text(String(qty), left + 330, y, { width: 36, align: "right" });
        doc.text(moneyFmt(unit, currency), left + 376, y, { width: 90, align: "right" });
        doc.text(moneyFmt(lineTotal, currency), left + 476, y, { width: right - (left + 476), align: "right" });

        y += optPretty.length ? 50 : 26;
        drawHr(doc, y);
        y += 10;
      }

      // Totals block at end
      ensurePageRoom(200);

      const totalsTop = y + 6;
      const totalsX = left + 320;

      doc.roundedRect(totalsX, totalsTop, right - totalsX, 118, 12).fillAndStroke("#ffffff", "#e5e7eb");
      doc.font("Helvetica").fontSize(10).fillColor("#374151");

      doc.text("Subtotal", totalsX + 12, totalsTop + 12, { width: 140 });
      doc.text(moneyFmt(subtotalCents, currency), totalsX + 12, totalsTop + 12, { width: right - totalsX - 24, align: "right" });

      doc.text("Shipping", totalsX + 12, totalsTop + 30, { width: 140 });
      doc.text(moneyFmt(shippingCents, currency), totalsX + 12, totalsTop + 30, { width: right - totalsX - 24, align: "right" });

      doc.text("Tax", totalsX + 12, totalsTop + 48, { width: 140 });
      doc.text(moneyFmt(taxCents, currency), totalsX + 12, totalsTop + 48, { width: right - totalsX - 24, align: "right" });

      if (creditsCents > 0) {
        doc.fillColor("#065f46").text("Loyalty credit", totalsX + 12, totalsTop + 66, { width: 160 });
        doc.text(`−${moneyFmt(creditsCents, currency)}`, totalsX + 12, totalsTop + 66, { width: right - totalsX - 24, align: "right" });
        doc.fillColor("#374151");
      } else {
        doc.text("Credits", totalsX + 12, totalsTop + 66, { width: 140 });
        doc.text(moneyFmt(0, currency), totalsX + 12, totalsTop + 66, { width: right - totalsX - 24, align: "right" });
      }

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
      doc.text("Total", totalsX + 12, totalsTop + 92, { width: 140 });
      doc.text(moneyFmt(totalCents, currency), totalsX + 12, totalsTop + 92, { width: right - totalsX - 24, align: "right" });

      // Left-side support note
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
      doc.text("Questions about this invoice? Contact support.", left, totalsTop + 18, { width: 250 });
      doc.font("Helvetica-Bold").fillColor("#111827").text(supportEmail, left, totalsTop + 36, { width: 250 });
      if (supportPhone) doc.font("Helvetica").fillColor("#111827").text(supportPhone, left, totalsTop + 52, { width: 250 });

      onPage();
    });

    const filename = (order as any).orderNumber
      ? `invoice-order-${String((order as any).orderNumber)}.pdf`
      : `invoice-${orderId.slice(0, 8)}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("invoice pdf failed:", msg);
    return NextResponse.json({ ok: false, error: "Failed to generate invoice PDF" }, { status: 500 });
  }
}
