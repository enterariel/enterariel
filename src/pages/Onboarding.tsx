import { useState } from 'react'
import { useApp } from '../store/AppContext'
import { CURRENCIES } from '../lib/utils'

const COUNTRIES: Record<string, string> = {
  Colombia: 'COP',
  México: 'MXN',
  Perú: 'PEN',
  Argentina: 'ARS',
  Chile: 'CLP',
  'República Dominicana': 'DOP',
  'Estados Unidos': 'USD',
}

export function Onboarding() {
  const { createBusiness } = useApp()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [country, setCountry] = useState('Colombia')
  const currency = COUNTRIES[country] ?? 'COP'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-brand-yellow">
      <div className="flex flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy text-2xl font-extrabold text-brand-yellow">
            t
          </div>
          <span className="text-3xl font-extrabold text-brand-navy">Treinta</span>
        </div>

        {step === 0 ? (
          <>
            <h1 className="text-[28px] font-extrabold leading-tight text-brand-navy">
              De cero, a Treinta
            </h1>
            <p className="mt-3 text-[15px] font-semibold text-brand-navy/80">
              Registra ventas y gastos, controla tu inventario, cobra tus fiados y comparte tu catálogo
              virtual. Todo desde un solo lugar.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                ['💰', 'Registra ventas y gastos en segundos'],
                ['📦', 'Inventario con alertas de stock bajo'],
                ['🤝', 'Control de deudas y abonos por cliente'],
                ['🛍️', 'Catálogo virtual para vender por WhatsApp'],
              ].map(([emoji, text]) => (
                <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3">
                  <span className="text-xl">{emoji}</span>
                  <span className="text-[14px] font-bold text-brand-navy">{text}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-primary mt-8 w-full" onClick={() => setStep(1)}>
              Empezar ahora
            </button>
          </>
        ) : (
          <div className="rounded-3xl bg-white p-5 shadow-card">
            <h2 className="text-[20px] font-extrabold text-brand-navy">Crea tu negocio</h2>
            <p className="mb-4 text-[13px] text-slate-500">Solo necesitas unos datos para comenzar.</p>

            <label className="label" htmlFor="business-name">
              Nombre del negocio *
            </label>
            <input
              id="business-name"
              className="field mb-3"
              placeholder="Ej: Vibe Chic"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <label className="label" htmlFor="owner-name">
              Tu nombre
            </label>
            <input
              id="owner-name"
              className="field mb-3"
              placeholder="Ej: Ariel"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            />

            <label className="label" htmlFor="country">
              País
            </label>
            <select
              id="country"
              className="field mb-1"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              {Object.keys(COUNTRIES).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <p className="mb-4 text-[12px] text-slate-500">
              Moneda: {currency} ({CURRENCIES[currency].symbol})
            </p>

            <button
              type="button"
              className="btn-primary w-full"
              disabled={!name.trim()}
              onClick={() => createBusiness({ name: name.trim(), owner: owner.trim(), currency, country, demo: false })}
            >
              Crear negocio
            </button>
            <button
              type="button"
              className="btn-ghost mt-3 w-full"
              onClick={() =>
                createBusiness({
                  name: name.trim() || 'Vibe Chic',
                  owner: owner.trim() || 'Propietario',
                  currency,
                  country,
                  demo: true,
                })
              }
            >
              Probar con datos de ejemplo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
