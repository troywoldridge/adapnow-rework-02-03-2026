import "server-only";

import type { Metadata } from "next";
import Link from "next/link";

import ArtworkUploadBoxes from "@/components/ArtworkUploadBoxes";

export const dynamic = "force-dynamic";

const SITE_NAME = "American Design And Printing";

type Params = { productId: string };
type Search = { lineId?: string; sides?: string; focusSide?: string };

function coerceSides(v?: string) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 10 ? Math.floor(n) : 2; // default 2 sides
}

function coerceFocusSide(v: unknown, sides: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 1 || i > sides) return null;
  return i;
}

function isValidLineId(v: unknown): v is string {
  return typeof v === "string" && /^[a-zA-Z0-9_-]{2,64}$/.test(v);
}

function makeLineId(): string {
  // Server-safe, no dependency on WebCrypto being present.
  // 16 chars base36-ish + timestamp suffix → low collision for this use.
  const rand = Math.random().toString(36).slice(2, 12);
  const rand2 = Math.random().toString(36).slice(2, 10);
  return `${rand}${rand2}`;
}

export function generateMetadata(): Metadata {
  return {
    title: `Upload Artwork | ${SITE_NAME}`,
    description: "Upload print-ready artwork for your product.",
    robots: { index: false, follow: false }, // workflow page, keep out of search
  };
}

export default async function UploadArtworkPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { productId } = await params;
  const sp = await searchParams;

  const sides = coerceSides(sp.sides);
  const focusSide = coerceFocusSide(sp.focusSide, sides);

  const lineId = isValidLineId(sp.lineId) ? sp.lineId : makeLineId();

  const productHref = `/products/${encodeURIComponent(productId)}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-gray-600">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link className="hover:underline" href="/">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className="hover:underline" href="/categories">
              Categories
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className="hover:underline" href={productHref}>
              Product
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-900 font-medium">
            Upload Artwork
          </li>
        </ol>
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Upload Artwork</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Upload print-ready files. We recommend a high-resolution PDF, CMYK, 300 DPI (minimum), with bleed and safe margins where applicable.
        </p>
      </header>

      {/* Client component — pass only primitives */}
      <ArtworkUploadBoxes
        lineId={lineId}
        sides={sides}
        focusSide={focusSide ?? undefined}
      />
    </main>
  );
}
