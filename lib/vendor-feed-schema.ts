import { z } from "zod";

// Shape of a Shopify /products.json response. Validated strictly enough
// that a real shape change (a field disappearing, price stopping being a
// string) throws loudly, per specs/02-phase-1-data-pipeline.md: "A shape
// change throws loudly rather than silently writing nulls."

export const ShopifyVariantSchema = z.object({
  id: z.number(),
  title: z.string(),
  sku: z.string().nullable(), // legitimately blank on some real listings, not a shape change
  available: z.boolean(),
  price: z.string(), // decimal string, e.g. "53.00" -- never treat as a float
  compare_at_price: z.string().nullable(),
});

export const ShopifyImageSchema = z.object({
  id: z.number(),
  src: z.string(),
  width: z.number(),
  height: z.number(),
});

export const ShopifyProductSchema = z.object({
  id: z.number(),
  title: z.string(),
  handle: z.string(),
  body_html: z.string(),
  product_type: z.string(),
  vendor: z.string(),
  tags: z.array(z.string()),
  variants: z.array(ShopifyVariantSchema).min(1),
  images: z.array(ShopifyImageSchema),
});

export const ShopifyProductsResponseSchema = z.object({
  products: z.array(ShopifyProductSchema),
});

export type ShopifyProduct = z.infer<typeof ShopifyProductSchema>;
export type ShopifyVariant = z.infer<typeof ShopifyVariantSchema>;

/** Decimal price string ("53.00") -> integer minor units (5300). Never a float. */
export function priceToMinorUnits(price: string): number {
  const match = /^(\d+)\.(\d{2})$/.exec(price.trim());
  if (!match) {
    throw new Error(`Unexpected price format: ${JSON.stringify(price)}`);
  }
  const [, whole, cents] = match;
  return Number(whole) * 100 + Number(cents);
}
