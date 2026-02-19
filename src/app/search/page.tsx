import type { Metadata } from "next";
import Link from "next/link";
import Search from "@/components/search/Search";
import SearchBar from "@/components/search/SearchBar";

export const metadata: Metadata = {
  title: "Search | ADAP",
  description: "Search ADAP products, print categories, and support resources in one place.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const params = await searchParams;
  const query = (params.query || "").trim();

  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Discovery</div>
          <h1 className="adap-title">Search ADAP</h1>
          <p className="adap-subtitle">
            Find products, inspiration, and support content quickly with real-time search results.
          </p>
          <SearchBar defaultValue={query} className="mt-4" />
        </section>

        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <h2 className="adap-card__title">Results {query ? `for “${query}”` : ""}</h2>
            <Link href="/categories" className="adap-btn adap-btn--ghost">Browse categories</Link>
          </div>
          <div style={{ marginTop: 16 }}>
            <Search placeholder="Search products by name…" />
          </div>
        </section>
      </div>
    </main>
  );
}
