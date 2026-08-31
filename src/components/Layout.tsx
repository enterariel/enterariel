import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BoxIcon, ChartIcon, HomeIcon, StoreIcon, UsersIcon } from './Icons'

const TABS = [
  { to: '/', label: 'Inicio', Icon: HomeIcon },
  { to: '/inventario', label: 'Inventario', Icon: BoxIcon },
  { to: '/clientes', label: 'Clientes', Icon: UsersIcon },
  { to: '/reportes', label: 'Reportes', Icon: ChartIcon },
  { to: '/catalogo', label: 'Catálogo', Icon: StoreIcon },
]

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const showTabs = TABS.some((tab) => tab.to === pathname)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-100 shadow-2xl">
      <main className={`flex-1 ${showTabs ? 'pb-24' : ''}`}>{children}</main>
      {showTabs && (
        <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5">
            {TABS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${
                    isActive ? 'text-brand-navy' : 'text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`rounded-full px-4 py-1 ${isActive ? 'bg-brand-yellow' : ''}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
