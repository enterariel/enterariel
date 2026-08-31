import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Business, Customer, Expense, Payment, Product, Sale, State } from '../types'
import { formatMoney, uid } from '../lib/utils'
import { buildSeed } from './seed'

const STORAGE_KEY = 'treinta-clone-state-v1'

const EMPTY_STATE: State = {
  business: null,
  products: [],
  customers: [],
  sales: [],
  expenses: [],
  payments: [],
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as State
    return { ...EMPTY_STATE, ...parsed }
  } catch {
    return EMPTY_STATE
  }
}

interface AppContextValue {
  state: State
  currency: string
  money: (value: number) => string
  createBusiness: (input: { name: string; owner: string; currency: string; country: string; demo: boolean }) => void
  updateBusiness: (patch: Partial<Business>) => void
  resetAll: () => void
  addProduct: (input: Omit<Product, 'id' | 'createdAt'>) => Product
  updateProduct: (id: string, patch: Partial<Product>) => void
  removeProduct: (id: string) => void
  addCustomer: (input: Pick<Customer, 'name' | 'phone' | 'note'>) => Customer
  updateCustomer: (id: string, patch: Partial<Customer>) => void
  removeCustomer: (id: string) => void
  addSale: (input: Omit<Sale, 'id' | 'code'>) => Sale
  removeSale: (id: string) => void
  addExpense: (input: Omit<Expense, 'id'>) => Expense
  removeExpense: (id: string) => void
  addPayment: (input: Omit<Payment, 'id'>) => Payment
  customerBalance: (customerId: string) => number
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const value = useMemo<AppContextValue>(() => {
    const currency = state.business?.currency ?? 'PYG'

    const applyStock = (products: Product[], items: Sale['items'], sign: number) =>
      products.map((product) => {
        const item = items.find((entry) => entry.productId === product.id)
        if (!item) return product
        return { ...product, stock: product.stock + sign * item.quantity }
      })

    return {
      state,
      currency,
      money: (amount: number) => formatMoney(amount, currency),

      createBusiness: ({ name, owner, currency: cur, country, demo }) => {
        if (demo) {
          setState(buildSeed(name, owner, cur, country))
          return
        }
        setState({
          ...EMPTY_STATE,
          business: {
            name,
            owner,
            phone: '',
            category: 'Tienda',
            currency: cur,
            country,
            createdAt: new Date().toISOString(),
          },
        })
      },

      updateBusiness: (patch) =>
        setState((prev) => (prev.business ? { ...prev, business: { ...prev.business, ...patch } } : prev)),

      resetAll: () => {
        localStorage.removeItem(STORAGE_KEY)
        setState(EMPTY_STATE)
      },

      addProduct: (input) => {
        const product: Product = { ...input, id: uid('prod'), createdAt: new Date().toISOString() }
        setState((prev) => ({ ...prev, products: [product, ...prev.products] }))
        return product
      },

      updateProduct: (id, patch) =>
        setState((prev) => ({
          ...prev,
          products: prev.products.map((product) => (product.id === id ? { ...product, ...patch } : product)),
        })),

      removeProduct: (id) =>
        setState((prev) => ({ ...prev, products: prev.products.filter((product) => product.id !== id) })),

      addCustomer: (input) => {
        const customer: Customer = { ...input, id: uid('cust'), createdAt: new Date().toISOString() }
        setState((prev) => ({ ...prev, customers: [customer, ...prev.customers] }))
        return customer
      },

      updateCustomer: (id, patch) =>
        setState((prev) => ({
          ...prev,
          customers: prev.customers.map((customer) => (customer.id === id ? { ...customer, ...patch } : customer)),
        })),

      removeCustomer: (id) =>
        setState((prev) => ({ ...prev, customers: prev.customers.filter((customer) => customer.id !== id) })),

      addSale: (input) => {
        const sale: Sale = { ...input, id: uid('sale'), code: `#${Math.random().toString(16).slice(2, 8)}` }
        setState((prev) => ({
          ...prev,
          sales: [sale, ...prev.sales],
          products: applyStock(prev.products, sale.items, -1),
        }))
        return sale
      },

      removeSale: (id) =>
        setState((prev) => {
          const sale = prev.sales.find((entry) => entry.id === id)
          if (!sale) return prev
          return {
            ...prev,
            sales: prev.sales.filter((entry) => entry.id !== id),
            payments: prev.payments.filter((payment) => payment.saleId !== id),
            products: applyStock(prev.products, sale.items, 1),
          }
        }),

      addExpense: (input) => {
        const expense: Expense = { ...input, id: uid('exp') }
        setState((prev) => ({ ...prev, expenses: [expense, ...prev.expenses] }))
        return expense
      },

      removeExpense: (id) =>
        setState((prev) => ({ ...prev, expenses: prev.expenses.filter((expense) => expense.id !== id) })),

      addPayment: (input) => {
        const payment: Payment = { ...input, id: uid('pay') }
        setState((prev) => ({ ...prev, payments: [payment, ...prev.payments] }))
        return payment
      },

      customerBalance: (customerId: string) => {
        const debt = state.sales
          .filter((sale) => sale.customerId === customerId && sale.method === 'credito' && !sale.paid)
          .reduce((total, sale) => total + sale.total, 0)
        const paid = state.payments
          .filter((payment) => payment.customerId === customerId)
          .reduce((total, payment) => total + payment.amount, 0)
        return Math.max(debt - paid, 0)
      },
    }
  }, [state])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider')
  return context
}
