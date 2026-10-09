/** Niveau de stock (administrateur uniquement). */
export const LOW_STOCK = 10;

export function stockLevel(stock: number | null): "out" | "low" | "ok" | "untracked" {
  if (stock == null) return "untracked";
  if (stock <= 0) return "out";
  return stock <= LOW_STOCK ? "low" : "ok";
}

export function StockBadge({ stock, className = "" }: { stock: number | null; className?: string }) {
  const level = stockLevel(stock);
  return (
    <span className={`stock ${className}`} data-level={level} title="Stock Shopify (visible par l'administrateur uniquement)">
      {level === "out" ? "Rupture" : level === "untracked" ? "Stock —" : `Stock ${stock}`}
    </span>
  );
}
