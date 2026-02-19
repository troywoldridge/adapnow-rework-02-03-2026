import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rewards Program | ADAP",
  description:
    "Earn points on print purchases, redeem credits at checkout, and track loyalty milestones with the ADAP rewards program.",
  alternates: { canonical: "/rewards" },
};

const REWARDS_STEPS = ["Place orders", "Accumulate points", "Redeem at checkout"];

export default function RewardsPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Loyalty</div>
          <h1 className="adap-title">ADAP Rewards</h1>
          <p className="adap-subtitle">
            Reward repeat buying with automatic point accrual and instant account-level visibility into available credit.
          </p>
          <div className="adap-pills">
            {REWARDS_STEPS.map((step) => (
              <span key={step} className="adap-pill">{step}</span>
            ))}
          </div>
          <div className="adap-actions">
            <Link href="/account" className="adap-btn adap-btn--primary">View My Rewards</Link>
            <Link href="/support" className="adap-btn adap-btn--ghost">Rewards FAQ</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
