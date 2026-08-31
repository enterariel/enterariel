import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { useApp } from '../store/AppContext'
import { addDays, methodLabel, shortDate, startOfDay } from '../lib/utils'

const RANGES = [
  { key: '7', label: '7 días', days: 7 },
  { key: '30', label: '30 días', days: 30 },
  { key: '90', label: '90 días', days: 90 },
]

const PIE_COLORS = ['#141B2D', '#FFD200', '#12A150', '#D92D20', '#7C3AED', '#0EA5E9']

export function Reportes() {
  const { state, money, currency } = useApp()
  const [range, setRange] = useState(RANGES[0])

  const from = useMemo(() => startOfDay(addDays(new Date(), -(range.days - 1))), [range])

  const sales = state.sales.filter((sale) => new Date(sale.date) >= from)
  const expenses = state.expenses.filter((expense) => new Date(expense.date) >= from)

  const income = sales.reduce((total, sale) => total + sale.total, 0)
  const outcome = expenses.reduce((total, expense) => total + expense.amount, 0)
  const cogs = sales.reduce((total, sale) => total + sale.cost, 0)
  const profit = income - outcome

  const daily = useMemo(() => {
    const buckets: { name: string; ventas: number; gastos: number }[] = []
    const days = Math.min(range.days, 14)
    for (let index = days - 1; index >= 0; index -= 1) {
      const day = startOfDay(addDays(new Date(), -index))
      const next = addDays(day, 1)
      buckets.push({
        name: shortDate(day),
        ventas: state.sales
          .filter((sale) => new Date(sale.date) >= day && new Date(sale.date) < next)
          .reduce((total, sale) => total + sale.total, 0),
        gastos: state.expenses
          .filter((expense) => new Date(expense.date) >= day && new Date(expense.date) < next)
          .reduce((total, expense) => total + expense.amount, 0),
      })
    }
    return buckets
  }, [state.sales, state.expenses, range])

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; total: number }>()
    sales.forEach((sale) =>
      sale.items.forEach((item) => {
        const current = map.get(item.name) ?? { name: item.name, quantity: 0, total: 0 }
        current.quantity += item.quantity
        current.total += item.unitPrice * item.quantity
        map.set(item.name, current)
      }),
    )
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  }, [sales])

  const byMethod = useMemo(() => {
    const map = new Map<string, number>()
    sales.forEach((sale) => map.set(sale.method, (map.get(sale.method) ?? 0) + sale.total))
    return [...map.entries()].map(([method, value]) => ({ name: methodLabel(method), value }))
  }, [sales])

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach((expense) => map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amount))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses])

  const downloadCsv = () => {
    const rows = [
      ['tipo', 'fecha', 'descripcion', 'metodo', 'valor', 'moneda'],
      ...sales.map((sale) => [
        'venta',
        new Date(sale.date).toISOString(),
        sale.items.map((item) => `${item.quantity}x ${item.name}`).join(' | '),
        sale.method,
        String(sale.total),
        currency,
      ]),
      ...expenses.map((expense) => [
        'gasto',
        new Date(expense.date).toISOString(),
        `${expense.category} ${expense.note}`.trim(),
        expense.method,
        String(-expense.amount),
        currency,
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `reporte-treinta-${range.key}d.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <header className="bg-brand-yellow px-4 pb-6 pt-4">
        <h1 className="text-[20px] font-extrabold text-brand-navy">Reportes</h1>
        <p className="text-[13px] font-semibold text-brand-navy/70">Estadísticas de tu negocio</p>
        <div className="mt-3 flex gap-2">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option)}
              className={`chip ${
                range.key === option.key ? 'bg-white text-brand-navy shadow-card' : 'bg-black/5 text-brand-navy/70'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        <section className="grid grid-cols-2 gap-3">
          {[
            { label: 'Ventas', value: income, tone: 'text-income' },
            { label: 'Gastos', value: outcome, tone: 'text-expense' },
            { label: 'Costo de mercancía', value: cogs, tone: 'text-slate-600' },
            { label: 'Ganancia', value: profit, tone: profit >= 0 ? 'text-income' : 'text-expense' },
          ].map((item) => (
            <div key={item.label} className="card p-4">
              <p className="text-[12px] font-bold text-slate-500">{item.label}</p>
              <p className={`text-[18px] font-extrabold ${item.tone}`}>{money(item.value)}</p>
            </div>
          ))}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-[15px] font-extrabold text-brand-navy">Ventas vs gastos</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="ventas" fill="#12A150" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gastos" fill="#D92D20" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-[15px] font-extrabold text-brand-navy">Productos más vendidos</h2>
          {topProducts.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-slate-400">Sin ventas en este período.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topProducts.map((product, index) => (
                <li key={product.name} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-yellow text-[12px] font-extrabold text-brand-navy">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-[14px] font-bold text-brand-navy">{product.name}</span>
                  <span className="text-right">
                    <span className="block text-[13px] font-extrabold text-brand-navy">{money(product.total)}</span>
                    <span className="block text-[11px] text-slate-500">{product.quantity} und.</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-[15px] font-extrabold text-brand-navy">Ventas por método de pago</h2>
          {byMethod.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-slate-400">Sin datos.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-36 w-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byMethod} dataKey="value" nameKey="name" innerRadius={34} outerRadius={62}>
                      {byMethod.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => money(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5">
                {byMethod.map((entry, index) => (
                  <li key={entry.name} className="flex items-center gap-2 text-[13px]">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="flex-1 font-bold text-brand-navy">{entry.name}</span>
                    <span className="text-slate-500">{money(entry.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-[15px] font-extrabold text-brand-navy">Gastos por categoría</h2>
          {byCategory.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-slate-400">Sin gastos en este período.</p>
          ) : (
            <ul className="space-y-2">
              {byCategory.map(([category, value]) => (
                <li key={category}>
                  <div className="flex justify-between text-[13px] font-bold text-brand-navy">
                    <span>{category}</span>
                    <span>{money(value)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-expense"
                      style={{ width: `${Math.round((value / (byCategory[0][1] || 1)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button type="button" className="btn-primary w-full" onClick={downloadCsv}>
          Descargar reporte CSV
        </button>
      </div>
    </div>
  )
}
