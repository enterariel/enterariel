import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { PlusIcon, SearchIcon } from '../components/Icons'
import { EmptyState } from '../components/EmptyState'

export function Inventario() {
  const { state, money } = useApp()
  const [query, setQuery] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.products.filter((product) => {
      const matches =
        !needle || product.name.toLowerCase().includes(needle) || product.barcode.includes(needle)
      const low = !onlyLow || product.stock <= product.minStock
      return matches && low
    })
  }, [state.products, query, onlyLow])

  const totalValue = state.products.reduce((total, product) => total + product.cost * product.stock, 0)
  const lowCount = state.products.filter((product) => product.stock <= product.minStock).length

  return (
    <div>
      <header className="bg-brand-yellow px-4 pb-6 pt-4">
        <h1 className="text-[20px] font-extrabold text-brand-navy">Inventario</h1>
        <p className="text-[13px] font-semibold text-brand-navy/70">
          {state.products.length} productos · valor {money(totalValue)}
        </p>
        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
          <input
            className="field pl-10"
            placeholder="Buscar producto o código"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={`chip ${onlyLow ? 'bg-black/5 text-brand-navy/70' : 'bg-white text-brand-navy shadow-card'}`}
            onClick={() => setOnlyLow(false)}
          >
            Todos
          </button>
          <button
            type="button"
            className={`chip ${onlyLow ? 'bg-white text-brand-navy shadow-card' : 'bg-black/5 text-brand-navy/70'}`}
            onClick={() => setOnlyLow(true)}
          >
            Stock bajo ({lowCount})
          </button>
        </div>
      </header>

      <div className="px-4 py-4">
        {products.length === 0 ? (
          <EmptyState
            emoji="📦"
            title="Sin productos"
            description="Crea tu primer producto para controlar el stock y vender más rápido."
            action={
              <Link to="/inventario/nuevo" className="btn-primary">
                <PlusIcon /> Crear producto
              </Link>
            }
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {products.map((product) => (
              <Link
                key={product.id}
                to={`/inventario/${product.id}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-slate-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">
                  {product.emoji || '📦'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-brand-navy">{product.name}</span>
                  <span className="block text-[12px] text-slate-500">
                    {product.category} · costo {money(product.cost)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[14px] font-extrabold text-brand-navy">{money(product.price)}</span>
                  <span
                    className={`block text-[11px] font-extrabold ${
                      product.stock <= product.minStock ? 'text-expense' : 'text-slate-500'
                    }`}
                  >
                    {product.stock} disp.
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        to="/inventario/nuevo"
        className="fixed bottom-[84px] left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 justify-center btn-primary shadow-lg"
      >
        <PlusIcon /> Crear producto
      </Link>
    </div>
  )
}
