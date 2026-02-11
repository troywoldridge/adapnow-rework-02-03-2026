// src/lib/authSession.ts
import "server-only";

import { auth } from "@clerk/nextjs/server";

type AuthResult = {
  userId: string | null;
  sessionId: string | null;
};

async function getAuthSafe(): Promise<AuthResult> {
  try {
    const a = await auth(); // server-safe in App Router
    return {
      userId: a.userId ?? null,
      sessionId: a.sessionId ?? null,
    };
  } catch {
    // Any Clerk hiccup should NOT explode your page or start query-param loops
    return { userId: null, sessionId: null };
  }
}

export async function getUserIdSafe(): Promise<string | null> {
  const { userId } = await getAuthSafe();
  return userId;
}

export async function getSessionIdSafe(): Promise<string | null> {
  const { sessionId } = await getAuthSafe();
  return sessionId;
}
