import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogTotal, saleItems } from '../src/lib/sale.js'

test('negotiated 8 Monster + 1 Mountain Dew is exactly $20 without losing units', () => {
  const items = saleItems([
    { product_id: 'monster', quantity: 8, catalogCents: 2400 },
    { product_id: 'dew', quantity: 1, catalogCents: 150 }
  ], 2000)
  assert.equal(items.reduce((s,i) => s + i.quantity * Math.round(i.unit_price * 100), 0), 2000)
  assert.equal(items.filter(i => i.product_id === 'monster').reduce((s,i) => s+i.quantity,0),8)
  assert.equal(items.filter(i => i.product_id === 'dew').reduce((s,i) => s+i.quantity,0),1)
})
test('odd promotional quantities preserve cents stored by Postgres', () => {
  const catalogCents = catalogTotal({ promo_qty: 2, promo_price: 2, sell_price: 1.5 },3)
  assert.equal(catalogCents,350)
  const items = saleItems([{ product_id: 'soda', quantity: 3, catalogCents }],catalogCents)
  assert.deepEqual(items.map(i=>[i.quantity,i.unit_price]),[[1,1.16],[2,1.17]])
})
test('zero totals are valid, empty carts and fractional quantities are rejected', () => {
  assert.deepEqual(saleItems([{product_id:'soda',quantity:2,catalogCents:0}],0),[{product_id:'soda',quantity:2,unit_price:0}])
  assert.throws(()=>saleItems([],100))
  assert.throws(()=>saleItems([{product_id:'soda',quantity:1.5,catalogCents:100}],100))
})
