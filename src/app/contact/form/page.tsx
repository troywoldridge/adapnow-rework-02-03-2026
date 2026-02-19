import { AdapHero } from "@/components/adap/PageSections";

export default function ContactFormPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <AdapHero
          kicker="Contact"
          title="Contact form"
          subtitle="Share your details and our team will reply within one business day."
          actions={[{ href: "/support", label: "Visit support", className: "adap-btn adap-btn--ghost" }]}
        />

        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <form className="grid gap-4 md:grid-cols-2" action="/contact" method="post">
            <label className="text-sm font-semibold text-slate-700">
              Full name
              <input className="mt-1 w-full rounded border border-slate-300 p-2" name="name" required />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Email
              <input className="mt-1 w-full rounded border border-slate-300 p-2" name="email" type="email" required />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Message
              <textarea className="mt-1 w-full rounded border border-slate-300 p-2" name="message" rows={5} required />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="adap-btn adap-btn--primary">Submit</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
