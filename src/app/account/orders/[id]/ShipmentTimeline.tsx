// src/app/account/orders/[id]/ShipmentTimeline.tsx
"use client";

import * as React from "react";

type ShipmentEvent = {
  time: string;
  description: string;
  location?: string;
};

type Shipment = {
  carrier: string;
  trackingNumber: string;
  status: string;
  eta?: string | null;
  events?: ShipmentEvent[];
};

type ShipmentsResponse =
  | { shipments: Shipment[] }
  | { error: string; shipments?: Shipment[] };

function safeText(v: unknown) {
  return typeof v === "string" ? v : "";
}

function sortEvents(events: ShipmentEvent[]) {
  return events
    .slice()
    .sort((a, b) => +new Date(b.time) - +new Date(a.time)); // newest first
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleString();
}

export default function ShipmentTimeline({ orderId }: { orderId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [shipments, setShipments] = React.useState<Shipment[]>([]);

  const load = React.useCallback(async () => {
    const controller = new AbortController();

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(
        `/api/me/shipments?orderId=${encodeURIComponent(orderId)}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        },
      );

      // ✅ Safely parse either JSON or text
      const contentType = res.headers.get("content-type") ?? "";
      let data: ShipmentsResponse | null = null;
      let rawText = "";

      if (contentType.includes("application/json")) {
        data = (await res.json()) as ShipmentsResponse;
      } else {
        rawText = await res.text();
      }

      if (!res.ok) {
        const message =
          (data && "error" in data && data.error && safeText(data.error)) ||
          rawText.slice(0, 200) ||
          "Failed to load tracking";
        throw new Error(message);
      }

      const next =
        data && "shipments" in data && Array.isArray(data.shipments)
          ? data.shipments
          : [];

      // Normalize/sort events
      const normalized = next.map((s) => ({
        ...s,
        events: s.events ? sortEvents(s.events) : [],
      }));

      setShipments(normalized);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const message = e instanceof Error ? e.message : "Failed to load tracking";
      setErr(message);
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [orderId]);

  React.useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(
          `/api/me/shipments?orderId=${encodeURIComponent(orderId)}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        );

        const contentType = res.headers.get("content-type") ?? "";
        let data: ShipmentsResponse | null = null;
        let rawText = "";

        if (contentType.includes("application/json")) {
          data = (await res.json()) as ShipmentsResponse;
        } else {
          rawText = await res.text();
        }

        if (!res.ok) {
          const message =
            (data && "error" in data && data.error && safeText(data.error)) ||
            rawText.slice(0, 200) ||
            "Failed to load tracking";
          throw new Error(message);
        }

        const next =
          data && "shipments" in data && Array.isArray(data.shipments)
            ? data.shipments
            : [];

        const normalized = next.map((s) => ({
          ...s,
          events: s.events ? sortEvents(s.events) : [],
        }));

        setShipments(normalized);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const message = e instanceof Error ? e.message : "Failed to load tracking";
        setErr(message);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [orderId]);

  if (loading) {
    return (
      <div className="text-sm text-gray-600" aria-live="polite">
        Loading tracking…
      </div>
    );
  }

  if (err) {
    return (
      <div className="space-y-3" aria-live="assertive">
        <div className="text-sm text-rose-700">{err}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!shipments.length) {
    return (
      <div className="text-sm text-gray-600">
        No tracking updates yet. Please check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {shipments.map((s, i) => (
        <div key={`${s.trackingNumber}-${i}`} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">
              {s.carrier} • {s.trackingNumber}
            </div>
            <div className="text-xs text-gray-600">
              Status:{" "}
              <span className="rounded-md bg-gray-100 px-2 py-0.5">
                {s.status}
              </span>
              {s.eta ? ` • ETA ${s.eta}` : ""}
            </div>
          </div>

          {s.events && s.events.length > 0 ? (
            <ol className="mt-3 space-y-2 text-sm text-gray-700">
              {s.events.map((e, j) => (
                <li key={`${e.time}-${j}`} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-gray-400" />
                  <div>
                    <div className="text-gray-900">{e.description}</div>
                    <div className="text-xs text-gray-500">
                      {fmtTime(e.time)}
                      {e.location ? ` • ${e.location}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-3 text-sm text-gray-600">
              Tracking is available, but detailed scan events haven’t been provided yet.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
