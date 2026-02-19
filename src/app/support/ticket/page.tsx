import { AdapHero } from "@/components/adap/PageSections";

export default function SupportTicketPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <AdapHero
          kicker="Support"
          title="Create a ticket"
          subtitle="Tell us what happened and we’ll route your request to the right specialist."
          actions={[{ href: "/support", label: "Back to support", className: "adap-btn adap-btn--ghost" }]}
        />

        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <form className="grid gap-4 md:grid-cols-2" action="/contact/form" method="post">
            <label className="text-sm font-semibold text-slate-700">
              Order number (optional)
              <input className="mt-1 w-full rounded border border-slate-300 p-2" name="orderNumber" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Email
              <input className="mt-1 w-full rounded border border-slate-300 p-2" name="email" type="email" required />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Issue details
              <textarea className="mt-1 w-full rounded border border-slate-300 p-2" name="details" rows={5} required />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="adap-btn adap-btn--primary">Submit ticket</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
