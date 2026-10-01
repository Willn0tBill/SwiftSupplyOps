export const cents = value => Math.round(Number(value) * 100)

export function catalogTotal(product, quantity) {
  const promo = Number(product.promo_qty)
  return promo > 0 && product.promo_price != null
    ? Math.floor(quantity / promo) * cents(product.promo_price) + (quantity % promo) * cents(product.sell_price)
    : quantity * cents(product.sell_price)
}

// Allocate a negotiated total in whole cents. Split a product into at most two
// price rows so quantity * stored unit_price always equals the actual total.
export function saleItems(lines, totalCents) {
  if (!lines.length || !Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('Add an item and enter a valid sale total.')
  if (lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity < 1)) throw new Error('Quantity must be a positive whole number.')
  const subtotal = lines.reduce((sum, line) => sum + line.catalogCents, 0)
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)
  let cumulative = 0, allocated = 0
  return lines.flatMap(line => {
    cumulative += subtotal ? line.catalogCents : line.quantity
    const through = Math.round(totalCents * cumulative / (subtotal || totalQuantity))
    const amount = through - allocated
    allocated = through
    const unit = Math.floor(amount / line.quantity)
    const remainder = amount % line.quantity
    const base = { product_id: line.product_id, ...(line.variant_id ? { variant_id: line.variant_id } : {}) }
    return [
      { ...base, quantity: line.quantity - remainder, unit_price: unit / 100 },
      { ...base, quantity: remainder, unit_price: (unit + 1) / 100 }
    ].filter(item => item.quantity > 0)
  })
}
