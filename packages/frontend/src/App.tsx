import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
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
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/vincular" element={<Vincular />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
