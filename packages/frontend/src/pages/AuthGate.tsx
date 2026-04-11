import { useState } from 'react';
import CuentaLogin from './CuentaLogin';
import Signup from './Signup';

// ============================================================================
// AuthGate — conmuta entre Login (stage none → cuenta) y Signup
// ============================================================================
// Se muestra cuando no hay token o el token es inválido. Toggleable por el
// link al pie de cada pantalla.
// ============================================================================
export default function AuthGate() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  return mode === 'login'
    ? <CuentaLogin onSwitchToSignup={() => setMode('signup')} />
    : <Signup onSwitchToLogin={() => setMode('login')} />;
}
