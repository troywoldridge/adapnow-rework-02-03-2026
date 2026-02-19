"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ClientToastHub";

function getFirst(sp: URLSearchParams, keys: string[]) {
  for (const k of keys) {
    const v = sp.get(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export default function HashToast() {
  const sp = useSearchParams();
  const router = useRouter();
  const { push } = useToast();

  const fired = React.useRef(false);

  React.useEffect(() => {
    if (!sp || fired.current) return;

    const msg = getFirst(sp, ["toast", "message"]);
    const hash = getFirst(sp, ["hash", "pricingHash", "optionHash"]);

    if (!msg && !hash) return;

    fired.current = true;

    if (msg) {
      push({ kind: "info", title: "Saved", message: msg });
    } else if (hash) {
      push({ kind: "success", title: "Pricing locked", message: `Hash: ${hash}` });
    }

    // clean URL: remove those params so refresh doesn't re-toast
    const next = new URL(window.location.href);
    ["toast", "message", "hash", "pricingHash", "optionHash"].forEach((k) => next.searchParams.delete(k));
    router.replace(next.pathname + (next.search ? next.search : ""), { scroll: false });
  }, [sp, router, push]);

  return null;
}
