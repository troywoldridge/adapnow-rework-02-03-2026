"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";

import categoryAssetsRaw from "@/data/categoryAssets.json";
import productAssetsRaw from "@/data/productAssets.json";

type Cat = { id?: number | string | null; slug?: string | null; name?: string | null };

type ProductAsset = {
  id?: number | string | null;
  name?: string | null;

  // various possible CF image fields (your repo has multiple shapes)
  cf_image_id?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;

  cloudflare_id?: string | null;
  cloudflare_image_id?: string | null;

  slug?: string | null;
  description?: string | null;

  [k: string]: unknown;
};

function sanitize(v: string): string {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const capped = raw.slice(0, 240);
  return capped.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function toSlug(s?: string | null): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifyName(name: string): string {
  return toSlug(name).slice(0, 80);
}

function isLikelyUrl(v: string): boolean {
  const s = String(v || "").trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://");
}

function isLikelyPath(v: string): boolean {
  const s = String(v || "").trim();
  return s.startsWith("/");
}

function guessSearchTerm(fromRaw: string): string {
  const from = sanitize(fromRaw);

  if (isLikelyUrl(from)) {
    try {
      const u = new URL(from);
      return guessSearchTerm(u.pathname + (u.search || ""));
    } catch {
      return "";
    }
  }

  if (isLikelyPath(from)) {
    const parts = from.split("?")[0].split("#")[0].split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    return guessSearchTerm(last);
  }

  const cleaned = from
    .replace(/[^\w\- ]+/g, " ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  if (cleaned.length < 3) return "";

  const lc = cleaned.toLowerCase();
  if (lc === "undefined" || lc === "null") return "";

  return cleaned.slice(0, 60);
}

function buildTopCategories(max = 10): Array<{ slug: string; name: string }> {
  const cats = (categoryAssetsRaw as unknown as Cat[]) || [];
  const out: Array<{ slug: string; name: string }> = [];
  const seen = new Set<string>();

  for (const c of cats) {
    const slug = toSlug(c?.slug) || (c?.id != null ? toSlug(String(c.id)) : "");
    if (!slug) continue;
    if (seen.has(slug)) continue;

    const name = String(c?.name || slug).trim() || slug;
    seen.add(slug);
    out.push({ slug, name });

    if (out.length >= max) break;
  }

  return out;
}

function scoreCategory(cat: { slug: string; name: string }, ref: string): number {
  const r = sanitize(ref).toLowerCase();
  if (!r) return 0;

  const slug = cat.slug.toLowerCase();
  const name = cat.name.toLowerCase();

  if (r === slug) return 100;
  if (r.includes(`/${slug}`)) return 95;
  if (r.includes(slug)) return 90;

  const nameTokens = name.split(/\s+/).filter(Boolean);
  for (const t of nameTokens) {
    if (t.length >= 4 && r.includes(t)) return 70;
  }

  const slugTokens = slug.split("-").filter(Boolean);
  for (const t of slugTokens) {
    if (t.length >= 4 && r.includes(t)) return 55;
  }

  return 0;
}

function firstCfIdFromProduct(p?: ProductAsset | null): string | null {
  if (!p) return null;
  const refs = [
    p.cf_image_1_id,
    p.cf_image_2_id,
    p.cf_image_3_id,
    p.cf_image_4_id,
    p.cf_image_id,
    p.cloudflare_image_id,
    p.cloudflare_id,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  return refs[0] || null;
}

function pickPopularProducts(max = 3): Array<{ id: number; name: string; href: string; imageUrl: string }> {
  const assets = (productAssetsRaw as unknown as ProductAsset[]) || [];
  const picked: Array<{ id: number; name: string; href: string; imageUrl: string }> = [];
  const seen = new Set<number>();

  for (const p of assets) {
    const id = Number(p?.id);
    const name = String(p?.name || "").trim();
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!name) continue;
    if (seen.has(id)) continue;

    const cfId = firstCfIdFromProduct(p);
    if (!cfId) continue;

    const slug = p?.slug ? toSlug(String(p.slug)) : slugifyName(name);
    const href = slug ? `/products/${id}/${slug}` : `/products/${id}`;

    const img = cfId.startsWith("http://") || cfId.startsWith("https://")
      ? cfId
      : (cfImage(cfId, "productThumb") || cfImage(cfId, "public") || "/placeholder.svg");

    seen.add(id);
    picked.push({ id, name, href, imageUrl: img });

    if (picked.length >= max) break;
  }

  return picked;
}

export default function NotFoundClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const fromRaw = sp.get("from") || "";
  const from = sanitize(fromRaw);

  const suggestedSearch = guessSearchTerm(fromRaw);
  const [q, setQ] = React.useState(suggestedSearch);

  React.useEffect(() => {
    setQ(suggestedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRaw]);

  const topCats = React.useMemo(() => {
    const base = buildTopCategories(10);
    if (!from) return base.slice(0, 8);

    return base
      .map((c) => ({ c, s: scoreCategory(c, from) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.c);
  }, [from]);

  const popular = React.useMemo(() => pickPopularProducts(3), []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = sanitize(q);
    router.push(query ? `/search?query=${encodeURIComponent(query)}` : "/search");
  };

  const mailto = React.useMemo(() => {
    const subject = "Broken link on ADAP site";
    const body = [
      "Hi ADAP team,",
      "",
      "I hit a page that could not be found.",
      from ? `Referrer: ${from}` : "",
      typeof window !== "undefined" ? `Page: ${window.location.href}` : "",
      "",
      "Thanks!",
    ]
      .filter(Boolean)
      .join("\n");

    return `mailto:support@adapnow.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [from]);

  return (
    <section className="notfound-help" aria-label="Not found help">
      <div className="notfound-help__card">
        <div className="notfound-help__top">
          <div className="notfound-help__badge" aria-hidden="true">404</div>
          <div className="notfound-help__heading">
            <h2 className="notfound-help__title">We couldn’t find that page.</h2>
            <p className="notfound-help__text">
              It may have been renamed, moved, or removed — but you’re still in the right place.
            </p>
          </div>
        </div>

        <div className="notfound-help__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.back()}>
            Go back
          </button>
          <Link className="btn btn-primary btn-sm" href="/">
            Home
          </Link>
          <Link className="btn btn-secondary btn-sm" href="/categories">
            Browse categories
          </Link>
        </div>

        <form
          className="notfound-help__search"
          role="search"
          aria-label="Search products"
          onSubmit={onSubmit}
          autoComplete="off"
        >
          <label className="notfound-help__searchLabel" htmlFor="notfound-q">
            Search instead
          </label>
          <div className="notfound-help__searchRow">
            <input
              id="notfound-q"
              className="notfound-help__searchInput"
              type="search"
              inputMode="search"
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="notfound-help__searchBtn">
              Search
            </button>
          </div>
          {suggestedSearch ? (
            <p className="notfound-help__searchHint">
              Suggested from referrer: <span className="notfound-help__mono">{suggestedSearch}</span>
            </p>
          ) : null}
        </form>

        {topCats.length > 0 && (
          <div className="notfound-help__cats" aria-label="Top categories">
            <div className="notfound-help__catsTitle">Top Categories</div>
            <ul className="notfound-help__catsList">
              {topCats.map((c) => (
                <li key={c.slug} className="notfound-help__catsItem">
                  <Link className="notfound-help__catsLink" href={`/categories/${c.slug}`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {popular.length > 0 && (
          <div className="notfound-help__popular" aria-label="Popular products">
            <div className="notfound-help__popularTitle">Popular Right Now</div>
            <ul className="notfound-help__popularGrid">
              {popular.map((p) => (
                <li key={p.id} className="notfound-help__popularCard">
                  <Link href={p.href} className="notfound-help__popularLink">
                    <div className="notfound-help__popularMedia" aria-hidden="true">
                      <Image
                        src={p.imageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 260px, 40vw"
                        className="notfound-help__popularImg"
                        unoptimized
                      />
                    </div>
                    <div className="notfound-help__popularBody">
                      <div className="notfound-help__popularName">{p.name}</div>
                      <div className="notfound-help__popularCta">Shop this</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {from ? (
          <p className="notfound-help__ref">
            Referrer: <span className="notfound-help__refValue">{from}</span>
          </p>
        ) : null}

        <div className="notfound-help__bottom">
          <p className="notfound-help__hint">
            Tip: If you bookmarked this page, update your bookmark after finding the new page.
          </p>
          <a className="notfound-help__report" href={mailto}>
            Report this broken link
          </a>
        </div>
      </div>
    </section>
  );
}
