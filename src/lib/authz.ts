// src/lib/authz.ts
import { auth } from "@clerk/nextjs/server";

export async function requireAdmin() {
  const { userId, sessionClaims } = auth();
  if (!userId) throw new Error("Unauthorized");

  const role = sessionClaims?.role;
  if (role !== "admin") throw new Error("Forbidden");

  return { userId };
}
