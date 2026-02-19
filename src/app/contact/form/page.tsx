import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Form | ADAP",
  description:
    "Submit your sales, service, or production questions through the ADAP contact form and receive a response from our team.",
  alternates: { canonical: "/contact/form" },
};

export default function ContactFormPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Talk to our team</div>
          <h1 className="adap-title">Contact Form</h1>
          <p className="adap-subtitle">
            Send your request with project details and deadlines so we can route it to the right specialist quickly.
          </p>
        </section>

        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <form className="grid gap-4 md:grid-cols-2" action="/contact" method="get">
            <label className="text-sm font-semibold text-slate-700">
              Full name
              <input name="name" required className="mt-1 w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Company
              <input name="company" className="mt-1 w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Email
              <input type="email" name="email" required className="mt-1 w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Phone
              <input type="tel" name="phone" className="mt-1 w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Topic
              <select name="topic" className="mt-1 w-full rounded-xl border border-slate-300 p-3">
                <option>Sales inquiry</option>
                <option>Order support</option>
                <option>Artwork question</option>
                <option>Billing support</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Message
              <textarea
                name="message"
                required
                rows={6}
                className="mt-1 w-full rounded-xl border border-slate-300 p-3"
                placeholder="Share product specs, quantity, finish, delivery location, and deadline."
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button className="adap-btn adap-btn--primary" type="submit">
                Submit Request
              </button>
              <Link href="/support" className="adap-btn adap-btn--ghost">
                Open Support Center
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
