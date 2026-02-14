"use client";

import * as React from "react";

type Row = {
  id: string;
  type: "earn" | "redeem" | "adjust" | string;
  pointsDelta: number;
  orderId?: string | null;
  note?: string | null;
  createdAt: string;
};

type ApiResponse =
  | { ok: true; rows: Row[] }
  | { ok: false; error?: string };

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function safeTypeLabel(t: string): string {
  const x = s(t).toLowerCase();
  if (x === "earn") return "Earned";
  if (x === "redeem") return "Redeemed";
  if (x === "adjust") return "Adjusted";
  return s(t) || "Activity";
}

function toneFor(t: string): "good" | "bad" | "neutral" {
  const x = s(t).toLowerCase();
  if (x === "earn") return "good";
  if (x === "redeem") return "bad";
  return "neutral";
}

function signFor(t: string): string {
  const x = s(t).toLowerCase();
  if (x === "earn") return "+";
  if (x === "redeem") return "−";
  return "";
}

function formatPoints(n: number): string {
  const v = Number.isFinite(n) ? Math.abs(n) : 0;
  return v.toLocaleString();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function readJsonSafe(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text().catch(() => "");
  return { ok: false, error: text || `HTTP ${res.status}` };
}

export default function RewardsHistory() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/me/loyalty/history", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal: ac.signal,
          headers: { accept: "application/json" },
        });

        const data = (await readJsonSafe(res)) as ApiResponse;
        if (!res.ok || !data?.ok) {
          throw new Error((data as any)?.error || `Failed to load history (HTTP ${res.status})`);
        }

        const list = Array.isArray((data as any).rows) ? ((data as any).rows as Row[]) : [];
        setRows(list);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(e?.message || "Failed to load loyalty activity");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  if (loading) {
    return (
      <div className="rewards-history rewards-history--card" aria-busy="true">
        <div className="rewards-history__loading">Loading loyalty activity…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rewards-history rewards-history--card">
        <div className="rewards-history__error" role="status">
          {err}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rewards-history rewards-history--card rewards-history--empty">
        <div className="rewards-history__empty">No loyalty activity yet.</div>
      </div>
    );
  }

  return (
    <div className="rewards-history" aria-label="Loyalty history">
      <div className="rewards-history__header">
        <h3 className="rewards-history__title">History</h3>
        <div className="rewards-history__sub">Recent points activity on your account.</div>
      </div>

      <div className="rewards-history__tableWrap">
        <table className="rewards-history__table">
          <thead className="rewards-history__thead">
            <tr>
              <th scope="col" className="rewards-history__th">Date</th>
              <th scope="col" className="rewards-history__th">Type</th>
              <th scope="col" className="rewards-history__th">Notes</th>
              <th scope="col" className="rewards-history__th rewards-history__th--right">Points</th>
            </tr>
          </thead>

          <tbody className="rewards-history__tbody">
            {rows.map((r) => {
              const tone = toneFor(r.type);
              const typeLabel = safeTypeLabel(r.type);
              const orderShort = r.orderId ? s(r.orderId).slice(0, 8) : "";
              const note = s(r.note);

              return (
                <tr key={r.id} className="rewards-history__tr">
                  <td className="rewards-history__td rewards-history__td--nowrap">
                    {formatDateTime(r.createdAt)}
                  </td>

                  <td className="rewards-history__td">
                    <span className={`pill pill--${tone}`}>{typeLabel}</span>
                    {orderShort ? (
                      <span className="rewards-history__orderRef">Order {orderShort}</span>
                    ) : null}
                  </td>

                  <td className="rewards-history__td">
                    {note ? note : <span className="rewards-history__muted">—</span>}
                  </td>

                  <td className="rewards-history__td rewards-history__td--right">
                    <span className={`points points--${tone}`}>
                      {signFor(r.type)}
                      {formatPoints(r.pointsDelta)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
