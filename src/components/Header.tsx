"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import Image from "@/components/ImageSafe";
import SearchBar from "@/components/SearchBar";
import { useCart } from "@/hooks/useCart";
import HeaderAuth from "@/components/account/HeaderAuth";
import { cfImage } from "@/lib/cfImages";

/**
 * NOTE (App Router):
 * This component is UI-only. Do NOT put <Head> / SEO tags here.
 * Use src/app/layout.tsx and per-page metadata (generateMetadata) for SEO.
 */

// Brand / content
const SITE_BRAND = "ADAP";
const SITE_TAGLINE = "Custom Print Experts";

// Cloudflare Images
const DEFAULT_LOGO_ID = "a90ba357-76ea-48ed-1c65-44fff4401600";
const LOGO_ID = process.env.NEXT_PUBLIC_CF_LOGO_ID ?? DEFAULT_LOGO_ID;

type HeaderProps = {
  className?: string;
};

type QuickLink = { href: string; label: string };

const DESKTOP_CATEGORY_LINKS: QuickLink[] = [
  { href: "/categories", label: "Categories" },
  { href: "/category/business-cards", label: "Business Cards" },
  { href: "/category/print-products", label: "Print Products" },
  { href: "/category/large-format", label: "Large Format" },
  { href: "/category/labels-and-packaging", label: "Labels & Packaging" },
  { href: "/category/apparel", label: "Apparel" },
  { href: "/category/sample-kits", label: "Sample Kits" },
];

const MOBILE_ACTIONS: Array<QuickLink & { icon: string }> = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/cart", label: "Cart", icon: "🛒" },
  { href: "/account", label: "Account", icon: "👤" },
  { href: "/shipping-info", label: "Shipping Info", icon: "🚚" },
];

export default function Header({ className = "" }: HeaderProps) {
  const pathname = usePathname() || "/";
  const { itemCount } = useCart();

  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const logoUrl = useMemo(() => {
    // cfImage can accept an ID or a full delivery URL; we use the ID with a public-ish variant.
    // If your variant name differs, change "public" here.
    return cfImage(LOGO_ID, "public");
  }, []);

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header className={`site-header ${className}`.trim()}>
      {/* Row 1: Brand + Search + Icons */}
      <div className="site-header__row site-header__row--top">
        <div className="site-header__inner">
          {/* Logo / Brand */}
          <Link href="/" onClick={closeMenu} className="site-header__brand" aria-label="Home">
            <Image
              src={logoUrl}
              alt={`${SITE_BRAND} logo`}
              width={56}
              height={56}
              priority
              className="site-header__logo"
            />
            <div className="site-header__brandText">
              <div className="site-header__brandName">{SITE_BRAND}</div>
              <div className="site-header__tagline">{SITE_TAGLINE}</div>
            </div>
          </Link>

          {/* Search (hidden on small screens) */}
          <div className="site-header__search">
            <SearchBar />
          </div>

          {/* Icons / actions */}
          <div className="site-header__actions">
            <Link href="/" className="site-header__iconBtn" aria-label="Home" title="Home">
              🏠
            </Link>

            <Link
              href="/shipping-info"
              className="site-header__iconBtn"
              aria-label="Shipping Info"
              title="Shipping Info"
            >
              🚚
            </Link>

            <Link
              href="/search"
              className="site-header__iconBtn site-header__iconBtn--mobileOnly"
              aria-label="Search"
              title="Search"
            >
              🔍
            </Link>

            <Link href="/cart" className="site-header__iconBtn site-header__cartBtn" aria-label="Cart" title="Cart">
              🛒
              {itemCount > 0 ? (
                <span className="site-header__badge" aria-label={`${itemCount} items in cart`}>
                  {itemCount}
                </span>
              ) : null}
            </Link>

            {/* Auth UI (Clerk / account) */}
            <div className="site-header__auth">
              <HeaderAuth />
            </div>

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="site-header__iconBtn site-header__iconBtn--mobileOnly"
              onClick={toggleMenu}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              aria-controls="site-mobile-menu"
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
      </div>

      {/* Row 2 (desktop): categories */}
      <nav className="site-header__row site-header__row--nav" aria-label="Category quick links">
        <div className="site-header__inner">
          <ul className="site-header__catGrid">
            {DESKTOP_CATEGORY_LINKS.map((l) => (
              <li key={l.href} className="site-header__catItem">
                <Link href={l.href} className="site-header__catLink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen ? (
        <div id="site-mobile-menu" className="site-mobile">
          <div className="site-header__inner site-mobile__inner">
            <div className="site-mobile__search">
              <SearchBar />
            </div>

            <div className="site-mobile__actions" aria-label="Quick actions">
              {MOBILE_ACTIONS.map((a) => (
                <Link key={a.href} href={a.href} onClick={closeMenu} className="site-mobile__action">
                  <span aria-hidden="true">{a.icon}</span>
                  <span>
                    {a.label}
                    {a.href === "/cart" && itemCount > 0 ? ` (${itemCount})` : ""}
                  </span>
                </Link>
              ))}
            </div>

            <div className="site-mobile__cats" aria-label="Categories">
              {DESKTOP_CATEGORY_LINKS.filter((l) => l.href !== "/categories").map((l) => (
                <Link key={l.href} href={l.href} onClick={closeMenu} className="site-mobile__cat">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
