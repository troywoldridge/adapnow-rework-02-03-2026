import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Live Chat Support | ADAP",
  description:
    "Connect with ADAP support for quick help on quotes, artwork setup, order tracking, and shipping questions.",
  alternates: { canonical: "/support/chat" },
};

export default function SupportChatPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--emerald">
          <div className="adap-kicker">Real-time help</div>
          <h1 className="adap-title">Support Chat</h1>
          <p className="adap-subtitle">
            Speak with a specialist for rapid answers on products, file prep, turnaround, shipping, and account issues.
          </p>
        </section>

        <section className="adap-card" style={{ marginTop: 18 }}>
          <h2 className="adap-card__title">Before starting chat</h2>
          <ul className="adap-checklist" style={{ marginTop: 12 }}>
            <li className="adap-checklist__item"><span className="adap-check">✓</span><span>Have your order number ready (if applicable)</span></li>
            <li className="adap-checklist__item"><span className="adap-check">✓</span><span>Include product specs and due date for quote or production help</span></li>
            <li className="adap-checklist__item"><span className="adap-check">✓</span><span>Attach screenshots when reporting checkout or artwork issues</span></li>
          </ul>
          <div className="adap-actions">
            <Link href="/support" className="adap-btn adap-btn--primary">Open Support Center</Link>
            <Link href="/support/ticket" className="adap-btn adap-btn--ghost">Create a Ticket Instead</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
