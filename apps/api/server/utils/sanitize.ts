/** Coerce price field to a clean integer (strip commas, truncate decimals). */
export function sanitizeItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item
    const obj = item as Record<string, unknown>
    if (obj.price != null) {
      const n = parseFloat(String(obj.price).replace(/,/g, ''))
      obj.price = isNaN(n) ? null : Math.round(n)
    }
    return obj
  })
}
