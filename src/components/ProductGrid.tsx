import Link from "next/link";
import Image from "@/components/ImageSafe";

type ProductLike = {
  id?: number | string | null;
  productId?: number | string | null;
  slug?: string | null;
  name?: string | null;
  sku?: string | null;
  description?: string | null;
  image?: string | null;
};

function toStr(v: unknown) {
  return v == null ? "" : String(v).trim();
}

function slugify(v: unknown) {
  return toStr(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ProductGrid({
  products,
  baseHref = "/products",
}: {
  products: ProductLike[];
  baseHref?: string;
}) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">
        No products found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((p, idx) => {
        const name = toStr(p.name) || toStr(p.sku) || `Product ${idx + 1}`;
        const idish = toStr(p.slug) || toStr(p.productId) || toStr(p.id) || slugify(name) || String(idx);
        const href = `${baseHref}/${encodeURIComponent(idish)}`;

        return (
          <Link
            key={`${idish}-${idx}`}
            href={href}
            className="group overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition"
          >
            <div className="aspect-square bg-gray-50">
              <Image src={toStr(p.image)} alt={name} className="h-full w-full object-cover" />
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold text-gray-900 group-hover:underline line-clamp-2">
                {name}
              </div>
              {p.description ? (
                <div className="mt-1 text-xs text-gray-600 line-clamp-2">{toStr(p.description)}</div>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
