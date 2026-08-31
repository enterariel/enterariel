import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useApp } from '../store/AppContext'
import { CURRENCIES } from '../lib/utils'

export function Ajustes() {
  const { state, updateBusiness, resetAll } = useApp()
  const navigate = useNavigate()
  const business = state.business
  const [name, setName] = useState(business?.name ?? '')
  const [owner, setOwner] = useState(business?.owner ?? '')
  const [phone, setPhone] = useState(business?.phone ?? '')
  const [category, setCategory] = useState(business?.category ?? '')
  const [currency, setCurrency] = useState(business?.currency ?? 'PYG')
  const [saved, setSaved] = useState(false)

  return (
    <div className="pb-10">
      <ScreenHeader title="Mi negocio" subtitle="Configura los datos de tu tienda" onBack={() => navigate('/')} />

      <div className="px-4 py-4">
        <div className="card p-4">
          <label className="label" htmlFor="settings-name">
            Nombre del negocio
          </label>
          <input
            id="settings-name"
            className="field mb-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <label className="label" htmlFor="settings-owner">
            Propietario
          </label>
          <input
            id="settings-owner"
            className="field mb-3"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          />

          <label className="label" htmlFor="settings-phone">
            WhatsApp del negocio
          </label>
          <input
            id="settings-phone"
            className="field mb-3"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <label className="label" htmlFor="settings-category">
            Categoría del negocio
          </label>
          <input
            id="settings-category"
            className="field mb-3"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />

          <label className="label" htmlFor="settings-currency">
            Moneda
          </label>
          <select
            id="settings-currency"
            className="field mb-4"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {Object.keys(CURRENCIES).map((option) => (
              <option key={option} value={option}>
                {option} ({CURRENCIES[option].symbol})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => {
              updateBusiness({ name, owner, phone, category, currency })
              setSaved(true)
              setTimeout(() => setSaved(false), 2000)
            }}
          >
            {saved ? 'Cambios guardados' : 'Guardar cambios'}
          </button>
        </div>

        <div className="card mt-4 p-4">
          <h2 className="text-[15px] font-extrabold text-brand-navy">Resumen</h2>
          <ul className="mt-2 space-y-1 text-[13px] text-slate-600">
            <li>{state.products.length} productos en inventario</li>
            <li>{state.customers.length} clientes registrados</li>
            <li>{state.sales.length} ventas registradas</li>
            <li>{state.expenses.length} gastos registrados</li>
          </ul>
        </div>

        <button
          type="button"
          className="btn-ghost mt-4 w-full text-expense"
          onClick={() => {
            if (window.confirm('¿Seguro que quieres borrar todos los datos del negocio?')) {
              resetAll()
            }
          }}
        >
          Borrar todos los datos
        </button>
      </div>
    </div>
  )
}
