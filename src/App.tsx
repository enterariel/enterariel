import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useApp } from './store/AppContext'
import { Onboarding } from './pages/Onboarding'
import { Inicio } from './pages/Inicio'
import { NuevaVenta } from './pages/NuevaVenta'
import { NuevoGasto } from './pages/NuevoGasto'
import { Inventario } from './pages/Inventario'
import { ProductoForm } from './pages/ProductoForm'
import { Clientes } from './pages/Clientes'
import { ClienteDetalle } from './pages/ClienteDetalle'
import { Reportes } from './pages/Reportes'
import { Catalogo } from './pages/Catalogo'
import { Comprobante } from './pages/Comprobante'
import { Ajustes } from './pages/Ajustes'

export default function App() {
  const { state } = useApp()

  if (!state.business) {
    return <Onboarding />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/venta/nueva" element={<NuevaVenta />} />
        <Route path="/venta/:id" element={<Comprobante />} />
        <Route path="/gasto/nuevo" element={<NuevoGasto />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/inventario/nuevo" element={<ProductoForm />} />
        <Route path="/inventario/:id" element={<ProductoForm />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClienteDetalle />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
