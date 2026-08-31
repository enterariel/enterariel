import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { Sheet } from '../components/Sheet'
import { MinusIcon, PlusIcon, SearchIcon } from '../components/Icons'
import { useApp } from '../store/AppContext'
import type { PaymentMethod, SaleItem } from '../types'

const METHODS: { value: PaymentMethod; label: string; emoji: string }[] = [
  { value: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { value: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
  { value: 'transferencia', label: 'Transferencia', emoji: '📲' },
  { value: 'credito', label: 'Fiado', emoji: '🤝' },
]

export function NuevaVenta() {
  const { state, money, addSale, addCustomer } = useApp()
  const navigate = useNavigate()

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('efectivo')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPrice, setQuickPrice] = useState('')
  const [quickItems, setQuickItems] = useState<SaleItem[]>([])
  const [customerOpen, setCustomerOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return state.products
    return state.products.filter(
      (product) => product.name.toLowerCase().includes(needle) || product.barcode.includes(needle),
    )
  }, [state.products, query])

  const items: SaleItem[] = useMemo(() => {
    const fromInventory = state.products
      .filter((product) => (quantities[product.id] ?? 0) > 0)
      .map((product) => ({
        productId: product.id,
        name: product.name,
        quantity: quantities[product.id],
        unitPrice: product.price,
        unitCost: product.cost,
      }))
    return [...fromInventory, ...quickItems]
  }, [state.products, quantities, quickItems])

  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
  const discountValue = Math.min(Number(discount) || 0, subtotal)
  const total = subtotal - discountValue
  const cost = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0)

  const setQty = (productId: string, delta: number, max: number) =>
    setQuantities((prev) => {
      const next = Math.max(0, Math.min((prev[productId] ?? 0) + delta, max))
      return { ...prev, [productId]: next }
    })

  const save = () => {
    if (items.length === 0) return
    if (method === 'credito' && !customerId) {
      setCustomerOpen(true)
      return
    }
    const sale = addSale({
      date: new Date().toISOString(),
      items,
      discount: discountValue,
      total,
      cost,
      method,
      customerId,
      note,
      paid: method !== 'credito',
      channel: 'mostrador',
    })
    navigate(`/venta/${sale.id}`, { replace: true })
  }

  return (
    <div className="pb-40">
      <ScreenHeader title="Nueva venta" subtitle="Selecciona los productos vendidos" />

      <div className="px-4 py-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
          <input
            className="field pl-10"
            placeholder="Buscar producto o código de barras"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setQuickOpen(true)}>
          <PlusIcon /> Agregar producto rápido (sin inventario)
        </button>

        <div className="card mt-4 divide-y divide-slate-100">
          {products.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-slate-500">No encontramos productos.</p>
          )}
          {products.map((product) => {
            const qty = quantities[product.id] ?? 0
            return (
              <div key={product.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl">
                  {product.emoji || '📦'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-brand-navy">{product.name}</p>
                  <p className="text-[12px] text-slate-500">
                    {money(product.price)} · {product.stock} disp.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Quitar ${product.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-brand-navy disabled:opacity-40"
                    disabled={qty === 0}
                    onClick={() => setQty(product.id, -1, product.stock)}
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="w-5 text-center text-[15px] font-extrabold">{qty}</span>
                  <button
                    type="button"
                    aria-label={`Agregar ${product.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-white disabled:opacity-40"
                    disabled={qty >= product.stock}
                    onClick={() => setQty(product.id, 1, product.stock)}
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {quickItems.length > 0 && (
          <div className="card mt-3 divide-y divide-slate-100">
            {quickItems.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl">🧾</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-brand-navy">{item.name}</p>
                  <p className="text-[12px] text-slate-500">
                    {item.quantity} × {money(item.unitPrice)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[12px] font-bold text-expense"
                  onClick={() => setQuickItems((prev) => prev.filter((_, i) => i !== index))}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="card mt-4 p-4">
          <label className="label" htmlFor="method">
            Método de pago
          </label>
          <div id="method" className="mb-4 grid grid-cols-2 gap-2">
            {METHODS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMethod(option.value)}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold ${
                  method === option.value
                    ? 'border-brand-navy bg-brand-yellow text-brand-navy'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {option.emoji} {option.label}
              </button>
            ))}
          </div>

          <label className="label" htmlFor="customer">
            Cliente {method === 'credito' && <span className="text-expense">*</span>}
          </label>
          <div className="mb-4 flex gap-2">
            <select
              id="customer"
              className="field"
              value={customerId ?? ''}
              onChange={(event) => setCustomerId(event.target.value || null)}
            >
              <option value="">Sin cliente</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost px-4" onClick={() => setCustomerOpen(true)}>
              <PlusIcon />
            </button>
          </div>

          <label className="label" htmlFor="discount">
            Descuento
          </label>
          <input
            id="discount"
            className="field mb-4"
            inputMode="numeric"
            placeholder="0"
            value={discount}
            onChange={(event) => setDiscount(event.target.value.replace(/[^0-9]/g, ''))}
          />

          <label className="label" htmlFor="note">
            Nota
          </label>
          <textarea
            id="note"
            className="field"
            rows={2}
            placeholder="Ej: entregar mañana"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-[13px] font-bold text-slate-500">
          <span>{items.reduce((sum, item) => sum + item.quantity, 0)} productos</span>
          {discountValue > 0 && <span>Descuento {money(discountValue)}</span>}
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[15px] font-bold text-slate-600">Total</span>
          <span className="text-[22px] font-extrabold text-brand-navy">{money(total)}</span>
        </div>
        <button type="button" className="btn-income w-full" disabled={items.length === 0} onClick={save}>
          Registrar venta
        </button>
      </div>

      <Sheet open={quickOpen} title="Producto rápido" onClose={() => setQuickOpen(false)}>
        <label className="label" htmlFor="quick-name">
          Descripción
        </label>
        <input
          id="quick-name"
          className="field mb-3"
          placeholder="Ej: Servicio de arreglo"
          value={quickName}
          onChange={(event) => setQuickName(event.target.value)}
        />
        <label className="label" htmlFor="quick-price">
          Valor
        </label>
        <input
          id="quick-price"
          className="field mb-4"
          inputMode="numeric"
          placeholder="0"
          value={quickPrice}
          onChange={(event) => setQuickPrice(event.target.value.replace(/[^0-9]/g, ''))}
        />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!quickName.trim() || !quickPrice}
          onClick={() => {
            setQuickItems((prev) => [
              ...prev,
              { productId: null, name: quickName.trim(), quantity: 1, unitPrice: Number(quickPrice), unitCost: 0 },
            ])
            setQuickName('')
            setQuickPrice('')
            setQuickOpen(false)
          }}
        >
          Agregar
        </button>
      </Sheet>

      <Sheet open={customerOpen} title="Nuevo cliente" onClose={() => setCustomerOpen(false)}>
        <label className="label" htmlFor="cust-name">
          Nombre
        </label>
        <input
          id="cust-name"
          className="field mb-3"
          value={newCustomer}
          onChange={(event) => setNewCustomer(event.target.value)}
        />
        <label className="label" htmlFor="cust-phone">
          Teléfono
        </label>
        <input
          id="cust-phone"
          className="field mb-4"
          inputMode="tel"
          value={newPhone}
          onChange={(event) => setNewPhone(event.target.value)}
        />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!newCustomer.trim()}
          onClick={() => {
            const customer = addCustomer({ name: newCustomer.trim(), phone: newPhone.trim(), note: '' })
            setCustomerId(customer.id)
            setNewCustomer('')
            setNewPhone('')
            setCustomerOpen(false)
          }}
        >
          Guardar cliente
        </button>
      </Sheet>
    </div>
  )
}
