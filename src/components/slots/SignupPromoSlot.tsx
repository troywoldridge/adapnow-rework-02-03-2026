"use client";

// src/components/slots/SignupPromoSlot.tsx
//
// Client slot so we can use pathname routing rules.
// Shows SignupPromoCard everywhere EXCEPT routes where it would hurt conversion
// or distract from task completion (cart/checkout/account/support flows).

import * as React from "react";
import { usePathname } from "next/navigation";
import SignupPromoCard from "@/components/SignupPromoCard";

const HIDE_PREFIXES = [
  "/checkout",
  "/cart",
  "/account",
  "/support",
];

function shouldHide(pathname: string): boolean {
  const p = String(pathname || "/").trim() || "/";
  // Exact home is allowed
  if (p === "/") return false;

  return HIDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

export default function SignupPromoSlot() {
  const pathname = usePathname() || "/";

  if (shouldHide(pathname)) return null;

  return <SignupPromoCard />;
}
