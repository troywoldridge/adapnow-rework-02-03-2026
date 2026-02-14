"use client";

import * as React from "react";

type Props = {
  /** Available points balance */
  balance: number;
  currency: "USD" | "CAD";
  /** Optional: parent can react to slider changes */
  onChange?: (points: number) => void;
};

type RedeemResponse = {
  credit: number; // dollars
  wallet?: unknown;
  error?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / step) * step;
}

async function safeJson<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export default function LoyaltyRedeemer({ balance, currency, onChange }: Props) {
  // business rule: 100 pts = $1
  const MIN_REDEEM = 100;
  const STEP = 100;

  const safeBalance = React.useMemo(() => {
    const b = Number(balance);
    return Number.isFinite(b) && b > 0 ? Math.floor(b) : 0;
  }, [balance]);

  const [points, setPoints] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const fmtMoney = React.useCallback(
    (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(n) || 0),
    [currency],
  );

  const dollars = React.useMemo(() => points / 100, [points]);

  const canRedeem = React.useMemo(() => {
    if (busy) return false;
    if (points < MIN_REDEEM) return false;
    if (points > safeBalance) return false;
    if (points % STEP !== 0) return false;
    return true;
  }, [busy, points, safeBalance]);

  const setPointsAndNotify = React.useCallback(
    (next: number) => {
      const v = clamp(roundToStep(next, STEP), 0, safeBalance);
      setPoints(v);
      onChange?.(v);
    },
    [onChange, safeBalance],
  );

  const redeem = React.useCallback(async () => {
    if (!canRedeem) return;

    try {
      setBusy(true);
      setMsg(null);

      // 1) Redeem points -> server validates and returns { credit, wallet }
      const res = await fetch("/api/me/loyalty/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });

      const data = (await safeJson<RedeemResponse>(res)) ?? null;
      if (!res.ok) throw new Error(data?.error || "Redeem failed");

      const credit = Number(data?.credit);
      if (!Number.isFinite(credit) || credit < 0) {
        throw new Error("Redeem failed: invalid credit returned from server");
      }

      // 2) Apply the returned credit (in dollars) to the cart
      const applyRes = await fetch("/api/cart/apply-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: credit }), // dollars
      });

      const applyJson = (await safeJson<{ ok?: boolean; error?: string }>(applyRes)) ?? null;
      if (!applyRes.ok || applyJson?.ok === false) {
        throw new Error(applyJson?.error || `Failed to apply credit (${applyRes.status})`);
      }

      setMsg(`Redeemed ${points.toLocaleString()} pts for ${fmtMoney(credit)}. Credit applied to your cart.`);

      // Reset slider and notify parent if needed
      setPointsAndNotify(0);
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong while redeeming points.");
    } finally {
      setBusy(false);
    }
  }, [canRedeem, fmtMoney, points, setPointsAndNotify]);

  // If balance drops below selected points (e.g. wallet updated elsewhere), clamp.
  React.useEffect(() => {
    if (points > safeBalance) setPointsAndNotify(safeBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeBalance]);

  return (
    <div className="rounded-xl border p-5">
      <div className="text-sm text-gray-700">
        Available: <b>{safeBalance.toLocaleString()}</b> pts
      </div>
      <div className="mt-1 text-xs text-gray-500">100 pts = {fmtMoney(1)}</div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={safeBalance}
        step={STEP}
        value={points}
        onChange={(e) => {
          const raw = Number(e.currentTarget.value) || 0;
          setPointsAndNotify(raw);
        }}
        className="mt-4 w-full"
        aria-label="Loyalty points to redeem"
      />

      {/* Numeric input (optional quick edits) */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={safeBalance}
          step={STEP}
          value={points}
          onChange={(e) => {
            const raw = Number(e.currentTarget.value) || 0;
            setPointsAndNotify(raw);
          }}
          className="w-32 rounded-lg border px-3 py-2 text-sm"
          inputMode="numeric"
          aria-label="Points to redeem"
        />
        <span className="text-sm text-gray-600">
          Redeem: <strong>{points.toLocaleString()} pts</strong> ({fmtMoney(dollars)})
        </span>
      </div>

      {/* Action */}
      <div className="mt-4">
        <button
          type="button"
          onClick={redeem}
          disabled={!canRedeem}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Redeeming…" : "Redeem"}
        </button>
      </div>

      {/* Helper / status */}
      {!canRedeem && (
        <div className="mt-2 text-xs text-gray-500">
          Enter a multiple of {STEP}, at least {MIN_REDEEM}, and no more than your balance.
        </div>
      )}
      {msg && <div className="mt-3 text-sm text-indigo-700">{msg}</div>}
    </div>
  );
}
