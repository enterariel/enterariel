import { Link, Navigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { WhatsappIcon } from '../components/Icons'
import { useApp } from '../store/AppContext'
import { fullDate, methodLabel } from '../lib/utils'

export function Comprobante() {
  const { id } = useParams()
  const { state, money, removeSale } = useApp()
  const sale = state.sales.find((entry) => entry.id === id)

  if (!sale) return <Navigate to="/" replace />

  const customer = state.customers.find((entry) => entry.id === sale.customerId)
  const lines = sale.items
    .map((item) => `• ${item.quantity} x ${item.name} — ${money(item.unitPrice * item.quantity)}`)
    .join('%0A')
  const message = `*${state.business?.name ?? 'Mi negocio'}*%0AComprobante ${sale.code}%0A${lines}%0A%0ATotal: ${money(
    sale.total,
  )}%0APago: ${methodLabel(sale.method)}`

  return (
    <div className="pb-10">
      <ScreenHeader title="Comprobante de venta" subtitle={sale.code} />

      <div className="px-4 py-4">
        <div className="card p-5">
          <div className="text-center">
            <p className="text-[17px] font-extrabold text-brand-navy">{state.business?.name}</p>
            <p className="text-[12px] text-slate-500">{fullDate(sale.date)}</p>
            <p className="mt-1 inline-block rounded-full bg-brand-yellow px-3 py-1 text-[12px] font-extrabold text-brand-navy">
              {sale.paid ? 'Pagada' : 'Fiada'}
            </p>
          </div>

          <div className="mt-4 divide-y divide-dashed divide-slate-200 border-y border-dashed border-slate-200">
            {sale.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-[14px] font-bold text-brand-navy">{item.name}</p>
                  <p className="text-[12px] text-slate-500">
                    {item.quantity} × {money(item.unitPrice)}
                  </p>
                </div>
                <p className="text-[14px] font-extrabold text-brand-navy">
                  {money(item.unitPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <dl className="mt-3 space-y-1.5 text-[13px]">
            {sale.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Descuento</dt>
                <dd className="font-bold text-expense">-{money(sale.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Método de pago</dt>
              <dd className="font-bold">{methodLabel(sale.method)}</dd>
            </div>
            {customer && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Cliente</dt>
                <dd className="font-bold">{customer.name}</dd>
              </div>
            )}
            {sale.note && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Nota</dt>
                <dd className="font-bold">{sale.note}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-[15px] font-bold text-slate-600">Total</span>
            <span className="text-[22px] font-extrabold text-brand-navy">{money(sale.total)}</span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <a
            className="btn-income w-full"
            href={`https://wa.me/${(customer?.phone ?? '').replace(/[^0-9]/g, '')}?text=${message}`}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsappIcon /> Enviar por WhatsApp
          </a>
          <button type="button" className="btn-ghost w-full" onClick={() => window.print()}>
            Imprimir comprobante
          </button>
          <Link to="/" className="btn-primary w-full">
            Volver al inicio
          </Link>
          <Link
            to="/"
            className="block w-full py-2 text-center text-[13px] font-bold text-expense"
            onClick={() => removeSale(sale.id)}
          >
            Anular venta
          </Link>
        </div>
      </div>
    </div>
  )
}
