import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search | ADAP",
  alternates: { canonical: "/search" },
};

export default function SearchPage({
  searchParams,
}: {
  searchParams: { query?: string };
}) {
  const query = (searchParams.query || "").trim();

  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Search</div>
              <h1 className="adap-title">Find products and resources</h1>
              <p className="adap-subtitle">
                {query ? `Showing results for “${query}”.` : "Enter a search term to get started."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
