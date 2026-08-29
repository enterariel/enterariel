import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { WhatsappIcon } from '../components/Icons'
import { EmptyState } from '../components/EmptyState'
import type { SaleItem } from '../types'

export function Catalogo() {
  const { state, money, addSale } = useApp()
  const [cart, setCart] = useState<Record<string, number>>({})
  const [copied, setCopied] = useState(false)

  const products = useMemo(
    () => state.products.filter((product) => product.inCatalog && product.stock > 0),
    [state.products],
  )

  const items: SaleItem[] = products
    .filter((product) => (cart[product.id] ?? 0) > 0)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      quantity: cart[product.id],
      unitPrice: product.price,
      unitCost: product.cost,
    }))

  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const orderText = encodeURIComponent(
    `Hola ${state.business?.name ?? ''}! Quiero pedir:\n${items
      .map((item) => `- ${item.quantity} x ${item.name}`)
      .join('\n')}\nTotal: ${money(total)}`,
  )

  return (
    <div className="pb-40">
      <header className="bg-brand-yellow px-4 pb-6 pt-4">
        <h1 className="text-[20px] font-extrabold text-brand-navy">Catálogo virtual</h1>
        <p className="text-[13px] font-semibold text-brand-navy/70">
          Comparte tus productos y recibe pedidos por WhatsApp
        </p>
        <button
          type="button"
          className="btn-ghost mt-3 w-full"
          onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/catalogo`)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? '¡Enlace copiado!' : 'Copiar enlace del catálogo'}
        </button>
      </header>

      <div className="px-4 py-4">
        {products.length === 0 ? (
          <EmptyState
            emoji="🛍️"
            title="Catálogo vacío"
            description="Marca productos con stock como visibles en el catálogo desde el inventario."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => {
              const qty = cart[product.id] ?? 0
              return (
                <article key={product.id} className="card overflow-hidden">
                  <div className="flex h-24 items-center justify-center bg-slate-100 text-4xl">
                    {product.emoji || '📦'}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[13px] font-bold text-brand-navy">{product.name}</p>
                    <p className="text-[12px] text-slate-500">{product.stock} disponibles</p>
                    <p className="mt-1 text-[15px] font-extrabold text-brand-navy">{money(product.price)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Quitar ${product.name}`}
                        className="h-7 w-7 rounded-full border border-slate-300 text-[15px] font-extrabold disabled:opacity-40"
                        disabled={qty === 0}
                        onClick={() => setCart((prev) => ({ ...prev, [product.id]: Math.max(0, qty - 1) }))}
                      >
                        −
                      </button>
                      <span className="flex-1 text-center text-[14px] font-extrabold">{qty}</span>
                      <button
                        type="button"
                        aria-label={`Agregar ${product.name}`}
                        className="h-7 w-7 rounded-full bg-brand-navy text-[15px] font-extrabold text-white disabled:opacity-40"
                        disabled={qty >= product.stock}
                        onClick={() => setCart((prev) => ({ ...prev, [product.id]: qty + 1 }))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-[70px] left-1/2 w-full max-w-md -translate-x-1/2 space-y-2 px-4">
          <a className="btn-income w-full shadow-lg" href={`https://wa.me/?text=${orderText}`} target="_blank" rel="noreferrer">
            <WhatsappIcon /> Pedir por WhatsApp · {money(total)}
          </a>
          <button
            type="button"
            className="btn-primary w-full shadow-lg"
            onClick={() => {
              addSale({
                date: new Date().toISOString(),
                items,
                discount: 0,
                total,
                cost: items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
                method: 'transferencia',
                customerId: null,
                note: 'Pedido desde catálogo virtual',
                paid: true,
                channel: 'catalogo',
              })
              setCart({})
            }}
          >
            Registrar pedido como venta
          </button>
        </div>
      )}
    </div>
  )
}
