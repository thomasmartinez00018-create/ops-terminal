import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import AuthGate from './pages/AuthGate';
import SelectWorkspace from './pages/SelectWorkspace';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Productos from './pages/Productos';
import Depositos from './pages/Depositos';
import Usuarios from './pages/Usuarios';
import Movimientos from './pages/Movimientos';
import Stock from './pages/Stock';
import Recetas from './pages/Recetas';
import Proveedores from './pages/Proveedores';
import Inventarios from './pages/Inventarios';
import Importar from './pages/Importar';
import Reportes from './pages/Reportes';
import Vincular from './pages/Vincular';
import OrdenesCompra from './pages/OrdenesCompra';
import ControlScanner from './pages/ControlScanner';
import Discrepancias from './pages/Discrepancias';
import EscanerFactura from './pages/EscanerFactura';
import Tareas from './pages/Tareas';
import Elaboraciones from './pages/Elaboraciones';
import Configuracion from './pages/Configuracion';
import Facturas from './pages/Facturas';
import CuentasPorPagar from './pages/CuentasPorPagar';
import ReportesCostos from './pages/ReportesCostos';
import ImportarLista from './pages/ImportarLista';
import Equivalencias from './pages/Equivalencias';
import ComparadorPrecios from './pages/ComparadorPrecios';
import Landing from './pages/Landing';
import Suscripcion from './pages/Suscripcion';

// ============================================================================
// SessionGate — decide qué pantalla mostrar según el stage del token
// ============================================================================
// Este es el "router" de más alto nivel, por encima de react-router. La
// app principal solo se monta cuando el usuario completó los 3 stages:
//   stage 'none'   → <AuthGate>       (login cuenta o signup)
//   stage 'cuenta' → <SelectWorkspace>
//   stage 'org'    → <Login>          (staff PIN login)
//   stage 'staff'  → <AuthProvider>+app routes
// ============================================================================
function SessionGate() {
  const { stage, loading } = useSession();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-on-surface-variant font-semibold">Conectando...</p>
      </div>
    );
  }

  if (stage === 'none') {
    // Public surface: landing en `/`, login en `/login`. Cualquier otra ruta
    // redirige a `/` para que un bookmark viejo (ej: /stock) no quede colgado.
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthGate />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (stage === 'cuenta') {
    return <SelectWorkspace />;
  }

  if (stage === 'org') {
    // Stage 2: workspace elegido pero staff sin loguear. El componente
    // Login.tsx pega a /api/auth/usuarios (que pide stage 2) y luego hace
    // /api/auth/login (que devuelve stage 3).
    return <Login />;
  }

  // stage === 'staff' → app principal
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/productos" element={<Productos />} />
            <Route path="/depositos" element={<Depositos />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/recetas" element={<Recetas />} />
            <Route path="/proveedores" element={<Proveedores />} />
            <Route path="/inventarios" element={<Inventarios />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/ordenes-compra" element={<OrdenesCompra />} />
            <Route path="/control-scanner" element={<ControlScanner />} />
            <Route path="/discrepancias" element={<Discrepancias />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/vincular" element={<Vincular />} />
            <Route path="/escanear-factura" element={<EscanerFactura />} />
            <Route path="/facturas" element={<Facturas />} />
            <Route path="/cuentas-por-pagar" element={<CuentasPorPagar />} />
            <Route path="/reportes-costos" element={<ReportesCostos />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="/tareas" element={<Tareas />} />
            <Route path="/elaboraciones" element={<Elaboraciones />} />
            <Route path="/importar-lista" element={<ImportarLista />} />
            <Route path="/equivalencias" element={<Equivalencias />} />
            <Route path="/comparador" element={<ComparadorPrecios />} />
            <Route path="/suscripcion" element={<Suscripcion />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <SessionGate />
      </ToastProvider>
    </SessionProvider>
  );
}
