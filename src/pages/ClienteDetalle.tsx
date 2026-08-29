import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { Sheet } from '../components/Sheet'
import { TrashIcon, WhatsappIcon } from '../components/Icons'
import { useApp } from '../store/AppContext'
import { fullDate, methodLabel } from '../lib/utils'
import type { PaymentMethod } from '../types'

export function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, money, customerBalance, addPayment, removeCustomer } = useApp()
  const customer = state.customers.find((entry) => entry.id === id)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('efectivo')

  const history = useMemo(() => {
    if (!customer) return []
    const sales = state.sales
      .filter((sale) => sale.customerId === customer.id)
      .map((sale) => ({
        id: sale.id,
        date: sale.date,
        label: sale.method === 'credito' ? 'Venta fiada' : `Venta ${methodLabel(sale.method)}`,
        amount: sale.total,
        positive: false,
      }))
    const payments = state.payments
      .filter((payment) => payment.customerId === customer.id)
      .map((payment) => ({
        id: payment.id,
        date: payment.date,
        label: `Abono ${methodLabel(payment.method)}`,
        amount: payment.amount,
        positive: true,
      }))
    return [...sales, ...payments].sort((a, b) => +new Date(b.date) - +new Date(a.date))
  }, [customer, state.sales, state.payments])

  if (!customer) return <Navigate to="/clientes" replace />

  const balance = customerBalance(customer.id)
  const whatsappText = encodeURIComponent(
    `Hola ${customer.name}, te recordamos que tienes un saldo pendiente de ${money(balance)} en ${
      state.business?.name ?? 'nuestro negocio'
    }. ¡Gracias!`,
  )

  return (
    <div className="pb-32">
      <ScreenHeader
        title={customer.name}
        subtitle={customer.phone || 'Sin teléfono'}
        right={
          <button
            type="button"
            aria-label="Eliminar cliente"
            className="rounded-full p-1.5 text-brand-navy active:bg-black/10"
            onClick={() => {
              removeCustomer(customer.id)
              navigate('/clientes', { replace: true })
            }}
          >
            <TrashIcon />
          </button>
        }
      />

      <div className="px-4 py-4">
        <div className="card p-4">
          <p className="text-[13px] font-bold text-slate-500">Saldo pendiente</p>
          <p className={`text-[28px] font-extrabold ${balance > 0 ? 'text-expense' : 'text-income'}`}>
            {money(balance)}
          </p>
          {customer.note && <p className="mt-1 text-[13px] text-slate-500">{customer.note}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-income flex-1" onClick={() => setOpen(true)}>
              Registrar abono
            </button>
            {customer.phone && (
              <a
                className="btn-ghost flex-1"
                href={`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}?text=${whatsappText}`}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsappIcon /> Cobrar
              </a>
            )}
          </div>
        </div>

        <h2 className="mb-2 mt-4 text-[15px] font-extrabold text-brand-navy">Historial</h2>
        <div className="card divide-y divide-slate-100">
          {history.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-slate-500">Sin movimientos todavía.</p>
          )}
          {history.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[14px] font-bold text-brand-navy">{entry.label}</p>
                <p className="text-[12px] text-slate-500">{fullDate(entry.date)}</p>
              </div>
              <p className={`text-[14px] font-extrabold ${entry.positive ? 'text-income' : 'text-brand-navy'}`}>
                {entry.positive ? '+' : ''}
                {money(entry.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={open} title="Registrar abono" onClose={() => setOpen(false)}>
        <label className="label" htmlFor="payment-amount">
          Valor del abono
        </label>
        <input
          id="payment-amount"
          className="field mb-3 text-[20px] font-extrabold"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
        />
        <label className="label" htmlFor="payment-method">
          Método
        </label>
        <select
          id="payment-method"
          className="field mb-4"
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
        </select>
        <button
          type="button"
          className="btn-income w-full"
          disabled={!amount || Number(amount) <= 0}
          onClick={() => {
            addPayment({
              date: new Date().toISOString(),
              customerId: customer.id,
              saleId: null,
              amount: Number(amount),
              method,
              note: '',
            })
            setAmount('')
            setOpen(false)
          }}
        >
          Guardar abono
        </button>
      </Sheet>
    </div>
  )
}
