import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useApp } from '../store/AppContext'
import type { PaymentMethod } from '../types'

const CATEGORIES = [
  'Mercancía',
  'Arriendo',
  'Servicios',
  'Nómina',
  'Transporte',
  'Impuestos',
  'Publicidad',
  'Otros',
]

const METHODS: PaymentMethod[] = ['efectivo', 'tarjeta', 'transferencia']

export function NuevoGasto() {
  const { addExpense, money } = useApp()
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [note, setNote] = useState('')
  const [supplier, setSupplier] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('efectivo')

  const value = Number(amount) || 0

  return (
    <div className="pb-32">
      <ScreenHeader title="Nuevo gasto" subtitle="Registra las salidas de dinero" />

      <div className="px-4 py-4">
        <div className="card p-4">
          <label className="label" htmlFor="amount">
            Valor del gasto *
          </label>
          <input
            id="amount"
            autoFocus
            className="field mb-1 text-[22px] font-extrabold"
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
          />
          <p className="mb-4 text-[13px] font-bold text-expense">{money(-value)}</p>

          <label className="label" htmlFor="category">
            Categoría
          </label>
          <div id="category" className="mb-4 flex flex-wrap gap-2">
            {CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={`chip border ${
                  category === option
                    ? 'border-brand-navy bg-brand-yellow text-brand-navy'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="label" htmlFor="supplier">
            Proveedor
          </label>
          <input
            id="supplier"
            className="field mb-4"
            placeholder="Opcional"
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
          />

          <label className="label" htmlFor="expense-method">
            Método de pago
          </label>
          <select
            id="expense-method"
            className="field mb-4"
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {METHODS.map((option) => (
              <option key={option} value={option}>
                {option[0].toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>

          <label className="label" htmlFor="expense-note">
            Nota
          </label>
          <textarea
            id="expense-note"
            className="field"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white p-4">
        <button
          type="button"
          className="btn-expense w-full"
          disabled={value <= 0}
          onClick={() => {
            addExpense({
              date: new Date().toISOString(),
              category,
              amount: value,
              note,
              method,
              supplier,
            })
            navigate('/', { replace: true })
          }}
        >
          Registrar gasto
        </button>
      </div>
    </div>
  )
}
