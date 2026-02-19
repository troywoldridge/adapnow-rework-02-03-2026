import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Submit Support Ticket | ADAP",
  description:
    "Create a detailed ADAP support ticket for order issues, billing help, artwork reviews, or shipping escalations.",
  alternates: { canonical: "/support/ticket" },
};

export default function SupportTicketPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Structured support</div>
          <h1 className="adap-title">Submit a Support Ticket</h1>
          <p className="adap-subtitle">
            Provide complete issue context so our operations team can investigate and respond with specific next steps.
          </p>
        </section>

        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <form className="grid gap-4 md:grid-cols-2" action="/contact/form" method="get">
            <label className="text-sm font-semibold text-slate-700">
              Order number (optional)
              <input name="order" className="mt-1 w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Priority
              <select name="priority" className="mt-1 w-full rounded-xl border border-slate-300 p-3">
                <option>Standard</option>
                <option>Urgent - deadline at risk</option>
                <option>Critical - production blocked</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Issue summary
              <input name="subject" required className="mt-1 w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Detailed description
              <textarea
                name="details"
                required
                rows={7}
                className="mt-1 w-full rounded-xl border border-slate-300 p-3"
                placeholder="Include timeline, observed behavior, expected outcome, and any action already taken."
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button className="adap-btn adap-btn--primary" type="submit">Continue</button>
              <Link href="/support/chat" className="adap-btn adap-btn--ghost">Use Live Chat</Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
