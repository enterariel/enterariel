import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { PlusIcon, SearchIcon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { EmptyState } from '../components/EmptyState'
import { initials } from '../lib/utils'

export function Clientes() {
  const { state, money, customerBalance, addCustomer } = useApp()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  const customers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.customers
      .map((customer) => ({ ...customer, balance: customerBalance(customer.id) }))
      .filter((customer) => !needle || customer.name.toLowerCase().includes(needle) || customer.phone.includes(needle))
      .sort((a, b) => b.balance - a.balance)
  }, [state.customers, query, customerBalance])

  const totalDebt = customers.reduce((total, customer) => total + customer.balance, 0)
  const debtors = customers.filter((customer) => customer.balance > 0).length

  return (
    <div>
      <header className="bg-brand-yellow px-4 pb-6 pt-4">
        <h1 className="text-[20px] font-extrabold text-brand-navy">Clientes y fiados</h1>
        <div className="mt-3 card p-4">
          <p className="text-[13px] font-bold text-slate-500">Total por cobrar</p>
          <p className="text-[24px] font-extrabold text-brand-navy">{money(totalDebt)}</p>
          <p className="text-[12px] font-semibold text-slate-500">
            {debtors} deudor(es) activos · {state.customers.length} clientes
          </p>
        </div>
        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
          <input
            className="field pl-10"
            placeholder="Buscar cliente"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      <div className="px-4 py-4">
        {customers.length === 0 ? (
          <EmptyState
            emoji="🤝"
            title="Sin clientes"
            description="Agrega clientes para llevar el control de sus fiados y abonos."
            action={
              <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
                <PlusIcon /> Agregar cliente
              </button>
            }
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                to={`/clientes/${customer.id}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-slate-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow text-[13px] font-extrabold text-brand-navy">
                  {initials(customer.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-brand-navy">{customer.name}</span>
                  <span className="block text-[12px] text-slate-500">{customer.phone || 'Sin teléfono'}</span>
                </span>
                <span className="text-right">
                  <span
                    className={`block text-[14px] font-extrabold ${
                      customer.balance > 0 ? 'text-expense' : 'text-income'
                    }`}
                  >
                    {money(customer.balance)}
                  </span>
                  <span className="block text-[11px] font-bold text-slate-400">
                    {customer.balance > 0 ? 'Debe' : 'Al día'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary fixed bottom-[84px] left-1/2 z-20 w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 shadow-lg"
      >
        <PlusIcon /> Agregar cliente
      </button>

      <Sheet open={open} title="Nuevo cliente" onClose={() => setOpen(false)}>
        <label className="label" htmlFor="new-name">
          Nombre *
        </label>
        <input id="new-name" className="field mb-3" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="label" htmlFor="new-phone">
          Teléfono
        </label>
        <input
          id="new-phone"
          className="field mb-3"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <label className="label" htmlFor="new-note">
          Nota
        </label>
        <input id="new-note" className="field mb-4" value={note} onChange={(event) => setNote(event.target.value)} />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!name.trim()}
          onClick={() => {
            addCustomer({ name: name.trim(), phone: phone.trim(), note: note.trim() })
            setName('')
            setPhone('')
            setNote('')
            setOpen(false)
          }}
        >
          Guardar cliente
        </button>
      </Sheet>
    </div>
  )
}
