"use client";

import * as React from "react";
import { useEffect, useRef } from "react";

export default function ClearCartCookie() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Fire-and-forget: clears sid/cart session server-side (and/or cookie).
    // keepalive helps when the user bounces quickly after success.
    fetch("/api/cart/clear", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
      headers: { accept: "application/json" },
    }).catch(() => {});
  }, []);

  return null;
}
