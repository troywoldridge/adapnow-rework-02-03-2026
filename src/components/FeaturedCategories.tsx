import Link from "next/link";
import Image from "@/components/ImageSafe";

type CategoryLike = {
  id?: number | string | null;
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  cf_image_id?: string | null;
  image?: string | null;
};

function slugify(v: unknown) {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function FeaturedCategories({
  categories,
  title = "Featured Categories",
}: {
  categories: CategoryLike[];
  title?: string;
}) {
  const list = Array.isArray(categories) ? categories : [];
  if (!list.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <Link href="/categories" className="text-sm text-blue-700 hover:underline">
          View all
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.slice(0, 12).map((c, idx) => {
          const slug = (c.slug && c.slug.trim()) ? c.slug.trim() : slugify(c.name ?? c.id ?? idx);
          const href = `/categories/${slug}`;
          const label = (c.name && c.name.trim()) ? c.name.trim() : `Category ${idx + 1}`;

          return (
            <Link
              key={`${slug}-${idx}`}
              href={href}
              className="group overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition"
            >
              <div className="aspect-[4/3] bg-gray-50">
                {/* if your categories don't have images, ImageSafe should handle empty gracefully */}
                <Image
                  src={(c.image || "").trim()}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold text-gray-900 group-hover:underline">{label}</div>
                {c.description ? (
                  <div className="mt-1 line-clamp-2 text-xs text-gray-600">{c.description}</div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
