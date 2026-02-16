import "server-only";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pickPrimaryEmail(u: any): string | null {
  const emails: any[] = Array.isArray(u?.emailAddresses) ? u.emailAddresses : [];
  const primaryId = u?.primaryEmailAddressId;
  const primary = emails.find((e) => e?.id === primaryId) ?? emails[0];
  return primary?.emailAddress ?? null;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return jsonNoStore({ ok: false, error: "Unauthorized" }, 401);

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    const email = pickPrimaryEmail(user);
    const firstName = user?.firstName ?? null;
    const lastName = user?.lastName ?? null;

    return jsonNoStore({
      ok: true,
      profile: {
        userId,
        email,
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
        imageUrl: user?.imageUrl ?? null,
        createdAt: user?.createdAt ? new Date(user.createdAt).toISOString() : null,
        updatedAt: user?.updatedAt ? new Date(user.updatedAt).toISOString() : null,
      },
    });
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: String(e?.message || e || "Unknown error") }, 500);
  }
}
