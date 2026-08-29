export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito'

export interface Business {
  name: string
  owner: string
  phone: string
  category: string
  currency: string
  country: string
  createdAt: string
}

export interface Product {
  id: string
  barcode: string
  name: string
  description: string
  category: string
  cost: number
  price: number
  stock: number
  minStock: number
  emoji: string
  inCatalog: boolean
  variants: Variant[]
  createdAt: string
}

export interface Variant {
  id: string
  name: string
  stock: number
  priceDelta: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  note: string
  createdAt: string
}

export interface SaleItem {
  productId: string | null
  name: string
  quantity: number
  unitPrice: number
  unitCost: number
}

export interface Sale {
  id: string
  code: string
  date: string
  items: SaleItem[]
  discount: number
  total: number
  cost: number
  method: PaymentMethod
  customerId: string | null
  note: string
  paid: boolean
  channel: 'mostrador' | 'catalogo'
}

export interface Expense {
  id: string
  date: string
  category: string
  amount: number
  note: string
  method: PaymentMethod
  supplier: string
}

export interface Payment {
  id: string
  date: string
  customerId: string
  saleId: string | null
  amount: number
  method: PaymentMethod
  note: string
}

export interface State {
  business: Business | null
  products: Product[]
  customers: Customer[]
  sales: Sale[]
  expenses: Expense[]
  payments: Payment[]
}
