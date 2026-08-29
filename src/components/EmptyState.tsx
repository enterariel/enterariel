interface Props {
  emoji: string
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ emoji, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
      <div className="text-4xl">{emoji}</div>
      <h3 className="text-[16px] font-extrabold text-brand-navy">{title}</h3>
      <p className="text-[13px] text-slate-500">{description}</p>
      {action && <div className="pt-3">{action}</div>}
    </div>
  )
}
