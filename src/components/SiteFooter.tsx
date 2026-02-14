import Link from "next/link";
import Image from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";

/**
 * Server Component (no "use client") ✅
 * - Uses env safely via cfImage helper (preferred: keep CF URL rules centralized)
 */

// Brand
const BRAND = "ADAP";
const TAGLINE = "Custom Print Experts";

// Cloudflare Images
const DEFAULT_LOGO_ID = "a90ba357-76ea-48ed-1c65-44fff4401600";
const LOGO_ID = process.env.NEXT_PUBLIC_CF_LOGO_ID ?? DEFAULT_LOGO_ID;

type FooterLink = { href: string; label: string };

const COL_ADAP: FooterLink[] = [
  { href: "/about", label: "About American Design And Printing" },
  { href: "/reviews", label: "Reviews" },
  { href: "/careers", label: "Careers" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/contact", label: "Contact Us" },
];

const COL_SERVICES: FooterLink[] = [
  { href: "/guarantees", label: "Our Guarantees" },
  { href: "/shipping", label: "Shipping Options" },
  { href: "/turnaround", label: "Turnaround Options" },
  { href: "/quotes", label: "Custom Quotes" },
  { href: "/submit-custom-order", label: "Submit Custom Order" },
];

const COL_RESOURCES: FooterLink[] = [
  { href: "/support", label: "Support Center" },
  { href: "/guides", label: "Artwork Setup Guides" },
  { href: "/business-tools", label: "Business Tools" },
  { href: "/accessibility", label: "Accessibility" },
];

export default function SiteFooter() {
  const year = new Date().getFullYear();

  // Use your shared CF helper. If your public logo variant differs, change "public".
  const logoUrl = cfImage(LOGO_ID, "public") || "/logo-footer.png";

  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer__inner">
        <div className="site-footer__grid">
          {/* Brand / hours / phone / social */}
          <div className="site-footer__brandCol">
            <div className="site-footer__brandRow">
              <Image
                src={logoUrl}
                alt={`${BRAND} — ${TAGLINE}`}
                width={72}
                height={72}
                className="site-footer__logo"
                priority
              />
              <div className="site-footer__brandText">
                <div className="site-footer__brandName">{BRAND}</div>
                <div className="site-footer__tagline">{TAGLINE}</div>
              </div>
            </div>

            <div className="site-footer__hours">
              <div className="site-footer__hoursTitle">Business Hours</div>
              <div>Monday to Friday</div>
              <div>Customer Service: 8 AM – 5 PM EST</div>
              <div>Local Pickup: 8 AM – 4 PM EST</div>
            </div>

            <a className="site-footer__phoneBtn" href="tel:1-866-899-2499">
              <span className="site-footer__phoneIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="site-footer__svg" fill="currentColor">
                  <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V21a1 1 0 01-1 1C11.4 22 2 12.6 2 1a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.02l-2.2 2.2z" />
                </svg>
              </span>
              1-866-899-2499
            </a>

            <div className="site-footer__social" aria-label="Social links">
              {/* Replace href with your real profiles */}
              <a href="#" aria-label="Facebook" className="site-footer__socialLink">
                <svg viewBox="0 0 24 24" className="site-footer__svg" fill="currentColor">
                  <path d="M22 12a10 10 0 10-11.6 9.9v-7h-2v-3h2V9.5c0-2 1.2-3.1 3-3.1.9 0 1.8.16 1.8.16v2h-1c-1 0-1.3.63-1.3 1.3V12h2.3l-.36 3h-1.94v7A10 10 0 0022 12z" />
                </svg>
              </a>
              <a href="#" aria-label="Instagram" className="site-footer__socialLink">
                <svg viewBox="0 0 24 24" className="site-footer__svg" fill="currentColor">
                  <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm0 2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H7zm5 3.5A5.5 5.5 0 1111.5 18 5.5 5.5 0 0112 7.5zm0 2A3.5 3.5 0 1015.5 13 3.5 3.5 0 0012 9.5zM18 6.3a1 1 0 11-1 1 1 1 0 011-1z" />
                </svg>
              </a>
              <a href="#" aria-label="YouTube" className="site-footer__socialLink">
                <svg viewBox="0 0 24 24" className="site-footer__svg" fill="currentColor">
                  <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.4 3.5 12 3.5 12 3.5s-7.4 0-9.4.6A3 3 0 00.5 6.2 36.4 36.4 0 000 12a36.4 36.4 0 00.5 5.8 3 3 0 002.1 2.1c2 .6 9.4.6 9.4.6s7.4 0 9.4-.6a3 3 0 002.1-2.1A36.4 36.4 0 0024 12a36.4 36.4 0 00-.5-5.8zM9.8 15.5v-7l6 3.5-6 3.5z" />
                </svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="site-footer__socialLink">
                <svg viewBox="0 0 24 24" className="site-footer__svg" fill="currentColor">
                  <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5H4.5V23H.5zM8.5 8.5H12v2h.05c.49-.93 1.7-1.9 3.5-1.9 3.75 0 4.45 2.47 4.45 5.66V23h-4V15.8c0-1.72-.03-3.94-2.4-3.94-2.41 0-2.78 1.88-2.78 3.82V23h-4V8.5z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2 */}
          <FooterCol title="ADAP" links={COL_ADAP} />

          {/* Column 3 */}
          <FooterCol title="Our Services" links={COL_SERVICES} />

          {/* Column 4 */}
          <FooterCol title="Resources" links={COL_RESOURCES} />
        </div>

        {/* Bottom bar */}
        <div className="site-footer__bottom">
          <p className="site-footer__copyright">© {year} {BRAND}. All rights reserved.</p>
          <div className="site-footer__bottomLinks">
            <Link href="/privacy" className="site-footer__bottomLink">Privacy</Link>
            <Link href="/terms" className="site-footer__bottomLink">Terms</Link>
            <Link href="/accessibility" className="site-footer__bottomLink">Accessibility</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="site-footer__col">
      <h3 className="site-footer__colTitle">{title}</h3>
      <ul className="site-footer__linkList">
        {links.map((l) => (
          <li key={l.href} className="site-footer__linkItem">
            <Link className="site-footer__link" href={l.href}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
