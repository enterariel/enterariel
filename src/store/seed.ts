import type { State } from '../types'
import { uid } from '../lib/utils'

function daysAgo(days: number, hour = 10, minute = 15): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export function buildSeed(businessName: string, owner: string, currency: string, country: string): State {
  const products = [
    { name: 'Camisa Rosada', emoji: '👕', category: 'Ropa', cost: 22000, price: 39000, stock: 12, minStock: 3 },
    { name: 'Chaqueta Amarilla', emoji: '🧥', category: 'Ropa', cost: 48000, price: 89000, stock: 5, minStock: 2 },
    { name: 'Bermuda Algodón', emoji: '🩳', category: 'Ropa', cost: 18000, price: 34000, stock: 2, minStock: 4 },
    { name: 'Gorra Clásica', emoji: '🧢', category: 'Accesorios', cost: 9000, price: 22000, stock: 20, minStock: 5 },
    { name: 'Medias Deportivas', emoji: '🧦', category: 'Accesorios', cost: 3500, price: 9000, stock: 40, minStock: 10 },
  ].map((p, index) => ({
    id: uid('prod'),
    barcode: `77012340000${index + 1}`,
    name: p.name,
    description: `${p.name} disponible en tu tienda`,
    category: p.category,
    cost: p.cost,
    price: p.price,
    stock: p.stock,
    minStock: p.minStock,
    emoji: p.emoji,
    inCatalog: true,
    variants: [],
    createdAt: daysAgo(30 - index),
  }))

  const customers = [
    { name: 'María Fernanda López', phone: '3001234567', note: 'Vecina del barrio' },
    { name: 'Carlos Pérez', phone: '3109876543', note: 'Compra por WhatsApp' },
    { name: 'Tienda La Esquina', phone: '3125557788', note: 'Cliente mayorista' },
  ].map((c) => ({ id: uid('cust'), ...c, createdAt: daysAgo(25) }))

  const sales = [
    { productIndex: 0, qty: 1, method: 'efectivo' as const, day: 0, customer: -1 },
    { productIndex: 1, qty: 1, method: 'tarjeta' as const, day: 0, customer: -1 },
    { productIndex: 3, qty: 2, method: 'transferencia' as const, day: 1, customer: 1 },
    { productIndex: 2, qty: 1, method: 'credito' as const, day: 2, customer: 0 },
    { productIndex: 4, qty: 5, method: 'efectivo' as const, day: 3, customer: -1 },
    { productIndex: 0, qty: 2, method: 'credito' as const, day: 5, customer: 2 },
  ].map((s, index) => {
    const product = products[s.productIndex]
    const total = product.price * s.qty
    return {
      id: uid('sale'),
      code: `#${(146000 + index * 37).toString(16)}`,
      date: daysAgo(s.day, 9 + index, 5 + index * 7),
      items: [
        {
          productId: product.id,
          name: product.name,
          quantity: s.qty,
          unitPrice: product.price,
          unitCost: product.cost,
        },
      ],
      discount: 0,
      total,
      cost: product.cost * s.qty,
      method: s.method,
      customerId: s.customer >= 0 ? customers[s.customer].id : null,
      note: '',
      paid: s.method !== 'credito',
      channel: 'mostrador' as const,
    }
  })

  const expenses = [
    { category: 'Mercancía', amount: 320000, note: 'Compra de inventario', day: 4, supplier: 'Distribuidora Central' },
    { category: 'Arriendo', amount: 850000, note: 'Local comercial', day: 6, supplier: '' },
    { category: 'Servicios', amount: 120000, note: 'Energía y agua', day: 2, supplier: '' },
    { category: 'Transporte', amount: 35000, note: 'Domicilios', day: 0, supplier: '' },
  ].map((e) => ({
    id: uid('exp'),
    date: daysAgo(e.day, 16, 30),
    category: e.category,
    amount: e.amount,
    note: e.note,
    method: 'efectivo' as const,
    supplier: e.supplier,
  }))

  const payments = [
    {
      id: uid('pay'),
      date: daysAgo(1, 12, 0),
      customerId: customers[0].id,
      saleId: null,
      amount: 10000,
      method: 'efectivo' as const,
      note: 'Abono parcial',
    },
  ]

  return {
    business: {
      name: businessName,
      owner,
      phone: '',
      category: 'Tienda de ropa',
      currency,
      country,
      createdAt: new Date().toISOString(),
    },
    products,
    customers,
    sales,
    expenses,
    payments,
  }
}
