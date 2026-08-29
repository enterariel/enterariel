import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
} from '../components/Icons'
import { addDays, initials, methodLabel, monthTitle, sameDay, shortDate, startOfDay, timeLabel } from '../lib/utils'

type Movement =
  | { kind: 'venta'; id: string; date: string; title: string; subtitle: string; amount: number; paid: boolean }
  | { kind: 'gasto'; id: string; date: string; title: string; subtitle: string; amount: number; paid: boolean }

export function Inicio() {
  const { state, money } = useApp()
  const navigate = useNavigate()
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()))
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const days = useMemo(() => {
    const today = startOfDay(new Date())
    return [-3, -2, -1, 0].map((offset) => addDays(today, offset))
  }, [])

  const movements = useMemo<Movement[]>(() => {
    const sales: Movement[] = state.sales.map((sale) => ({
      kind: 'venta',
      id: sale.id,
      date: sale.date,
      title:
        sale.items.length === 1
          ? `${sale.items[0].quantity} ${sale.items[0].name}`
          : `Venta ${sale.code} · ${sale.items.length} productos`,
      subtitle: `${methodLabel(sale.method)} · ${shortDate(new Date(sale.date))} - ${timeLabel(sale.date)}`,
      amount: sale.total,
      paid: sale.paid,
    }))
    const expenses: Movement[] = state.expenses.map((expense) => ({
      kind: 'gasto',
      id: expense.id,
      date: expense.date,
      title: expense.category,
      subtitle: `${expense.note || methodLabel(expense.method)} · ${shortDate(new Date(expense.date))} - ${timeLabel(expense.date)}`,
      amount: -expense.amount,
      paid: true,
    }))
    return [...sales, ...expenses].sort((a, b) => +new Date(b.date) - +new Date(a.date))
  }, [state.sales, state.expenses])

  const visible = useMemo(() => {
    const byDay = showAll ? movements : movements.filter((movement) => sameDay(movement.date, selectedDay))
    if (!query.trim()) return byDay
    const needle = query.trim().toLowerCase()
    return byDay.filter(
      (movement) => movement.title.toLowerCase().includes(needle) || movement.subtitle.toLowerCase().includes(needle),
    )
  }, [movements, selectedDay, showAll, query])

  const income = visible.filter((movement) => movement.amount > 0).reduce((total, m) => total + m.amount, 0)
  const outcome = visible.filter((movement) => movement.amount < 0).reduce((total, m) => total + m.amount, 0)
  const lowStock = state.products.filter((product) => product.stock <= product.minStock)

  return (
    <div>
      <header className="bg-brand-yellow px-4 pb-16 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-navy text-[13px] font-extrabold text-brand-yellow">
            {initials(state.business?.name ?? 'Mi negocio')}
          </div>
          <Link to="/ajustes" className="flex-1">
            <p className="text-[16px] font-extrabold leading-tight text-brand-navy">{state.business?.name}</p>
            <p className="text-[12px] font-semibold text-brand-navy/70">
              {state.business?.owner ? `${state.business.owner} · Propietario` : 'Propietario'}
            </p>
          </Link>
          <button
            type="button"
            aria-label="Buscar"
            className="rounded-full p-1.5 text-brand-navy active:bg-black/10"
            onClick={() => setSearching((prev) => !prev)}
          >
            <SearchIcon />
          </button>
          <Link to="/inventario" aria-label="Alertas" className="relative rounded-full p-1.5 text-brand-navy">
            <BellIcon />
            {lowStock.length > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-expense px-1 text-[10px] font-extrabold text-white">
                {lowStock.length}
              </span>
            )}
          </Link>
        </div>

        {searching && (
          <input
            autoFocus
            className="field mt-3"
            placeholder="Buscar movimientos"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}

        <div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto">
          {days.map((day) => {
            const active = !showAll && sameDay(day.toISOString(), selectedDay)
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  setShowAll(false)
                  setSelectedDay(day)
                }}
                className={`chip ${active ? 'bg-white text-brand-navy shadow-card' : 'bg-black/5 text-brand-navy/70'}`}
              >
                {shortDate(day)}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`chip flex items-center gap-1 ${
              showAll ? 'bg-white text-brand-navy shadow-card' : 'bg-black/5 text-brand-navy/70'
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            Todo
          </button>
        </div>
      </header>

      <div className="-mt-12 px-4">
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold text-slate-500">Balance</span>
            <span className="text-[20px] font-extrabold text-brand-navy">{money(income + outcome)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            <div>
              <p className="flex items-center gap-1 text-[13px] font-bold text-income">
                <ArrowUpIcon /> Ingresos
              </p>
              <p className="text-[17px] font-extrabold text-brand-navy">{money(income)}</p>
            </div>
            <div className="border-l border-slate-100 pl-3">
              <p className="flex items-center gap-1 text-[13px] font-bold text-expense">
                <ArrowDownIcon /> Egresos
              </p>
              <p className="text-[17px] font-extrabold text-brand-navy">{money(outcome)}</p>
            </div>
          </div>
          <Link
            to="/reportes"
            className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[13px] font-extrabold text-brand-navy"
          >
            <span className="underline">Descargar reportes</span>
            <span className="flex items-center gap-1">
              Ver balance <ChevronRightIcon className="h-4 w-4" />
            </span>
          </Link>
        </section>

        {lowStock.length > 0 && (
          <Link
            to="/inventario"
            className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-[13px] font-bold text-amber-900"
          >
            ⚠️ {lowStock.length} producto(s) con stock bajo
            <ChevronRightIcon className="ml-auto h-4 w-4" />
          </Link>
        )}

        <section className="mt-4">
          <h2 className="mb-2 text-[15px] font-extrabold capitalize text-brand-navy">
            {showAll ? 'Todos los movimientos' : monthTitle(selectedDay)}
          </h2>
          <div className="card divide-y divide-slate-100">
            {visible.length === 0 && (
              <p className="px-4 py-8 text-center text-[13px] text-slate-500">
                No hay movimientos en esta fecha. Registra tu primera venta o gasto.
              </p>
            )}
            {visible.map((movement) => (
              <button
                key={movement.id}
                type="button"
                onClick={() => movement.kind === 'venta' && navigate(`/venta/${movement.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    movement.kind === 'venta' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
                  }`}
                >
                  {movement.kind === 'venta' ? <ArrowUpIcon /> : <ArrowDownIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-brand-navy">{movement.title}</span>
                  <span className="block truncate text-[12px] text-slate-500">{movement.subtitle}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[14px] font-extrabold text-brand-navy">{money(movement.amount)}</span>
                  <span
                    className={`block text-[11px] font-extrabold ${
                      movement.paid ? 'text-income' : 'text-expense'
                    }`}
                  >
                    {movement.kind === 'venta' ? (movement.paid ? 'Pagada' : 'Fiada') : 'Gasto'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed bottom-[70px] left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 gap-3 px-4">
        <Link to="/venta/nueva" className="btn-income flex-1 shadow-lg">
          <PlusIcon /> Nueva venta
        </Link>
        <Link to="/gasto/nuevo" className="btn-expense flex-1 shadow-lg">
          <MinusIcon /> Nuevo gasto
        </Link>
      </div>
    </div>
  )
}
