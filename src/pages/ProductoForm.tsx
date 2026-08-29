import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useApp } from '../store/AppContext'
import { TrashIcon } from '../components/Icons'
import type { Variant } from '../types'
import { uid } from '../lib/utils'

const EMOJIS = ['📦', '👕', '🧥', '👟', '🧢', '🍎', '🥤', '🍞', '💊', '🧴', '🔧', '📱']

export function ProductoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, addProduct, updateProduct, removeProduct } = useApp()
  const existing = state.products.find((product) => product.id === id)

  const [tab, setTab] = useState<'general' | 'variantes'>('general')
  const [name, setName] = useState(existing?.name ?? '')
  const [barcode, setBarcode] = useState(existing?.barcode ?? '')
  const [category, setCategory] = useState(existing?.category ?? 'General')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [cost, setCost] = useState(existing ? String(existing.cost) : '')
  const [price, setPrice] = useState(existing ? String(existing.price) : '')
  const [stock, setStock] = useState(existing ? String(existing.stock) : '')
  const [minStock, setMinStock] = useState(existing ? String(existing.minStock) : '3')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '📦')
  const [inCatalog, setInCatalog] = useState(existing?.inCatalog ?? true)
  const [variants, setVariants] = useState<Variant[]>(existing?.variants ?? [])
  const [variantName, setVariantName] = useState('')
  const [variantStock, setVariantStock] = useState('')

  const margin = (Number(price) || 0) - (Number(cost) || 0)

  const save = () => {
    const payload = {
      name: name.trim(),
      barcode: barcode.trim(),
      category: category.trim() || 'General',
      description: description.trim(),
      cost: Number(cost) || 0,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      minStock: Number(minStock) || 0,
      emoji,
      inCatalog,
      variants,
    }
    if (existing) {
      updateProduct(existing.id, payload)
    } else {
      addProduct(payload)
    }
    navigate('/inventario', { replace: true })
  }

  return (
    <div className="pb-32">
      <ScreenHeader
        title={existing ? 'Editar producto' : 'Crear producto'}
        right={
          existing ? (
            <button
              type="button"
              aria-label="Eliminar producto"
              className="rounded-full p-1.5 text-brand-navy active:bg-black/10"
              onClick={() => {
                removeProduct(existing.id)
                navigate('/inventario', { replace: true })
              }}
            >
              <TrashIcon />
            </button>
          ) : null
        }
      />

      <div className="flex border-b border-slate-200 bg-white">
        {(['general', 'variantes'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 py-3 text-[14px] font-extrabold ${
              tab === option ? 'border-b-2 border-brand-navy text-brand-navy' : 'text-slate-400'
            }`}
          >
            {option === 'general' ? 'Información general' : 'Agregar variantes'}
          </button>
        ))}
      </div>

      {tab === 'general' ? (
        <div className="px-4 py-4">
          <div className="card p-4">
            <span className="label">Imagen del producto</span>
            <div className="mb-4 flex flex-wrap gap-2">
              {EMOJIS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEmoji(option)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
                    emoji === option ? 'border-brand-navy bg-brand-yellow' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <label className="label" htmlFor="barcode">
              Código de barras
            </label>
            <input
              id="barcode"
              className="field mb-3"
              inputMode="numeric"
              placeholder="5449000000996"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value.replace(/[^0-9]/g, ''))}
            />

            <label className="label" htmlFor="name">
              Nombre del producto *
            </label>
            <input
              id="name"
              className="field mb-3"
              placeholder="Camisa azul"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <label className="label" htmlFor="category">
              Categoría
            </label>
            <input
              id="category"
              className="field mb-3"
              placeholder="Ropa"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="stock">
                  Cantidad disponible *
                </label>
                <input
                  id="stock"
                  className="field"
                  inputMode="numeric"
                  placeholder="20"
                  value={stock}
                  onChange={(event) => setStock(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <div>
                <label className="label" htmlFor="min-stock">
                  Cantidad mínima
                </label>
                <input
                  id="min-stock"
                  className="field"
                  inputMode="numeric"
                  placeholder="3"
                  value={minStock}
                  onChange={(event) => setMinStock(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cost">
                  Precio de compra
                </label>
                <input
                  id="cost"
                  className="field"
                  inputMode="numeric"
                  placeholder="0"
                  value={cost}
                  onChange={(event) => setCost(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <div>
                <label className="label" htmlFor="price">
                  Precio de venta *
                </label>
                <input
                  id="price"
                  className="field"
                  inputMode="numeric"
                  placeholder="0"
                  value={price}
                  onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
            </div>
            <p className="mb-3 text-[12px] font-bold text-slate-500">
              Ganancia por unidad: <span className={margin >= 0 ? 'text-income' : 'text-expense'}>{margin}</span>
            </p>

            <label className="label" htmlFor="description">
              Descripción
            </label>
            <textarea
              id="description"
              className="field mb-3"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />

            <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-navy"
                checked={inCatalog}
                onChange={(event) => setInCatalog(event.target.checked)}
              />
              <span className="text-[13px] font-bold text-brand-navy">Mostrar en el catálogo virtual</span>
            </label>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4">
          <div className="card p-4">
            <p className="mb-3 text-[13px] text-slate-500">
              Crea variantes como tallas, colores o presentaciones.
            </p>
            <div className="mb-3 flex gap-2">
              <input
                className="field"
                placeholder="Ej: Talla M"
                value={variantName}
                onChange={(event) => setVariantName(event.target.value)}
              />
              <input
                className="field w-24"
                inputMode="numeric"
                placeholder="Cant."
                value={variantStock}
                onChange={(event) => setVariantStock(event.target.value.replace(/[^0-9]/g, ''))}
              />
              <button
                type="button"
                className="btn-primary px-4"
                disabled={!variantName.trim()}
                onClick={() => {
                  setVariants((prev) => [
                    ...prev,
                    { id: uid('var'), name: variantName.trim(), stock: Number(variantStock) || 0, priceDelta: 0 },
                  ])
                  setVariantName('')
                  setVariantStock('')
                }}
              >
                Añadir
              </button>
            </div>
            {variants.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-slate-400">Aún no hay variantes.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {variants.map((variant) => (
                  <li key={variant.id} className="flex items-center justify-between py-2.5">
                    <span className="text-[14px] font-bold text-brand-navy">{variant.name}</span>
                    <span className="flex items-center gap-3 text-[13px] text-slate-500">
                      {variant.stock} disp.
                      <button
                        type="button"
                        className="text-expense"
                        aria-label={`Eliminar ${variant.name}`}
                        onClick={() => setVariants((prev) => prev.filter((entry) => entry.id !== variant.id))}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white p-4">
        <button type="button" className="btn-primary w-full" disabled={!name.trim() || !price} onClick={save}>
          {existing ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </div>
  )
}
