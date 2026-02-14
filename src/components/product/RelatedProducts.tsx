import ProductCard from "@/components/product/ProductCard";
import { getProductsBySubcategory } from "@/lib/sinalite.client";
import { mergeProduct } from "@/lib/mergeUtils";
import type { Product } from "@/types/product";

type Props = {
  currentProductId: string | number;
  subcategoryId: string | number;
};

function toIdString(v: string | number): string {
  return String(v);
}

export default async function RelatedProducts({ currentProductId, subcategoryId }: Props) {
  const storeCode = process.env.NEXT_PUBLIC_STORE_CODE;
  if (!storeCode) {
    // In server components, failing silently is better than crashing the page.
    return null;
  }

  const allProducts = await getProductsBySubcategory(subcategoryId, storeCode);

  const related = (Array.isArray(allProducts) ? allProducts : [])
    .filter((p: any) => toIdString(p?.id) !== toIdString(currentProductId))
    .slice(0, 4)
    .map((p: any) => mergeProduct(p)) as Product[];

  if (!related.length) return null;

  return (
    <section className="related-products my-14">
      <h3 className="section-title">Related Products</h3>
      <ul className="product-grid">
        {related.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </ul>
    </section>
  );
}
