# Product and Category Data

Static JSON files for catalog display. Product metadata can also come from `sinalite_products` (DB) when populated via `pnpm sinalite:ingest`.

## productAssets.json

Array of product objects. Schema:

```json
[
  {
    "id": 123,
    "product_id": 123,
    "name": "Product Name",
    "cf_image_1_id": "cloudflare-image-id",
    "sku": "SKU123",
    "matched_sku": "SKU123"
  }
]
```

- `id` or `product_id`: Required. Sinalite product ID.
- `name`: Display name.
- `cf_image_1_id`: Cloudflare Images ID for primary image.
- `sku`, `matched_sku`: For matching and slugs.

## categoryAssets.json

Array of category objects (e.g. for nav).

## subcategoryAssets.json

Array of subcategory objects. May include `product_id` to link to a product.
