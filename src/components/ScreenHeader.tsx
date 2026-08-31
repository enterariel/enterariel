import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from './Icons'

interface Props {
  title: string
  subtitle?: string
  right?: ReactNode
  onBack?: () => void
}

export function ScreenHeader({ title, subtitle, right, onBack }: Props) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-brand-yellow px-4 py-3.5">
      <button
        type="button"
        aria-label="Volver"
        onClick={() => (onBack ? onBack() : navigate(-1))}
        className="rounded-full p-1 text-brand-navy active:bg-black/10"
      >
        <BackIcon />
      </button>
      <div className="flex-1">
        <h1 className="text-[17px] font-extrabold leading-tight text-brand-navy">{title}</h1>
        {subtitle && <p className="text-[12px] font-semibold text-brand-navy/70">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}
