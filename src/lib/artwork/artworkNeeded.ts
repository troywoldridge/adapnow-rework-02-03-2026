// src/lib/artwork/artworkNeeded.ts
import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type ArtworkNeededRow = {
  cart_line_id: string;
};

export async function findCartLinesMissingArtwork(input?: { limit?: number }): Promise<ArtworkNeededRow[]> {
  const limit = Math.max(1, Math.min(500, Number(input?.limit ?? 100) || 100));

  // Minimal assumptions:
  // - cart_lines has id uuid
  // - cart_artwork has cart_line_id uuid
  const res = await db.execute(sql<ArtworkNeededRow>`
    select cl.id as cart_line_id
    from cart_lines cl
    left join cart_artwork ca on ca.cart_line_id = cl.id
    where ca.id is null
    order by cl.created_at desc nulls last, cl.id desc
    limit ${limit}
  `);

  // drizzle .execute returns { rows } in some drivers; in others it returns array.
  const rows = (res as any)?.rows ?? (res as any);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Job entrypoint used by /api/jobs/artwork-needed
 * This *scans* and returns candidates.
 * Email sending is wired in the next step when we implement "@/lib/sendEmail" (currently missing in your build).
 */
export async function scanAndSendArtworkNeededEmails(input?: { limit?: number }) {
  const candidates = await findCartLinesMissingArtwork({ limit: input?.limit ?? 100 });
  return {
    ok: true as const,
    scanned: candidates.length,
    queued: 0,
    candidates,
    note:
      "Scan completed. Email sending will be enabled once the sendEmail module is added (your build currently reports it missing).",
  };
}

/** Small helper often used elsewhere */
export async function artworkNeededForLine(cartLineId: string): Promise<boolean> {
  const res = await db.execute(sql<{ has: boolean }>`
    select exists(
      select 1 from cart_artwork where cart_line_id = ${cartLineId}::uuid
    ) as has
  `);
  const rows = (res as any)?.rows ?? (res as any);
  const first = Array.isArray(rows) ? rows[0] : null;
  return !(first?.has ?? false);
}
