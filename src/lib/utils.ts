export const CURRENCIES: Record<string, { symbol: string; locale: string }> = {
  PYG: { symbol: '₲', locale: 'es-PY' },
  COP: { symbol: '$', locale: 'es-CO' },
  MXN: { symbol: '$', locale: 'es-MX' },
  USD: { symbol: '$', locale: 'en-US' },
  PEN: { symbol: 'S/', locale: 'es-PE' },
  ARS: { symbol: '$', locale: 'es-AR' },
  CLP: { symbol: '$', locale: 'es-CL' },
  DOP: { symbol: 'RD$', locale: 'es-DO' },
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

const ZERO_DECIMAL_CURRENCIES = ['PYG', 'COP', 'CLP']

export function formatMoney(value: number, currency = 'PYG'): string {
  const conf = CURRENCIES[currency] ?? CURRENCIES.PYG
  const decimals = ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2
  const amount = Math.abs(value).toLocaleString(conf.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${value < 0 ? '-' : ''}${conf.symbol}${amount}`
}

export function todayISO(): string {
  return new Date().toISOString()
}

export function sameDay(iso: string, day: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTH_LABELS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function dayLabel(date: Date): string {
  return DAY_LABELS[date.getDay()]
}

export function shortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTH_SHORT[date.getMonth()]}`
}

export function monthTitle(date: Date): string {
  return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PY', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function fullDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()} · ${timeLabel(iso)}`
}

export function methodLabel(method: string): string {
  switch (method) {
    case 'efectivo':
      return 'Efectivo'
    case 'tarjeta':
      return 'Tarjeta'
    case 'transferencia':
      return 'Transferencia'
    case 'credito':
      return 'Fiado'
    default:
      return method
  }
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}
