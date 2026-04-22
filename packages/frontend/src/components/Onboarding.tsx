import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, X, LayoutDashboard, ArrowRightLeft,
  ClipboardList, ShoppingCart, ScanBarcode,
  Bell, CheckCircle, Utensils, Wine, Warehouse
} from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  titulo: string;
  descripcion: string;
  tip?: string;
}

const STEPS_POR_ROL: Record<string, Step[]> = {
  cocina: [
    {
      icon: <Utensils size={36} className="text-primary" />,
      titulo: 'Bienvenido al sistema de stock',
      descripcion: 'Tu rol es Cocina. Esta app te permite registrar rápidamente los ingredientes que usás, las mermas y los ingresos — sin papeles.',
      tip: 'Solo te lleva 3 toques registrar algo.',
    },
    {
      icon: <ArrowRightLeft size={36} className="text-blue-400" />,
      titulo: 'Registrar es fácil',
      descripcion: 'Desde el inicio tocá "Registrar uso" o "Registrar merma". Buscá el producto (podés escribir parte del nombre), ponés la cantidad y listo.',
      tip: 'Activá "Modo continuo" si tenés varios para registrar seguidos.',
    },
    {
      icon: <ClipboardList size={36} className="text-success" />,
      titulo: 'Consultá el stock en cualquier momento',
      descripcion: 'En la pestaña "Stock" podés ver qué hay disponible en cada depósito. Si algo está bajo mínimo aparece resaltado en rojo.',
    },
    {
      icon: <CheckCircle size={36} className="text-success" />,
      titulo: '¡Todo listo!',
      descripcion: 'Ya sabés lo esencial. Recordá que todo lo que registrás queda con tu nombre, así que el responsable de cada movimiento siempre es claro.',
      tip: 'Si tenés dudas, podés consultar el historial en "Movimientos".',
    },
  ],

  barra: [
    {
      icon: <Wine size={36} className="text-primary" />,
      titulo: 'Bienvenido al sistema de stock',
      descripcion: 'Tu rol es Barra. Podés registrar los consumos, mermas e ingresos de tus productos sin complicaciones.',
      tip: 'Todo queda registrado con tu nombre y la hora exacta.',
    },
    {
      icon: <ArrowRightLeft size={36} className="text-blue-400" />,
      titulo: 'Registrar consumos',
      descripcion: 'Desde el inicio tocá "Registrar uso". Buscá la bebida o insumo que usaste, ponés la cantidad y confirmás. En segundos.',
      tip: 'Los productos que más usás van a aparecer primero como "Recientes".',
    },
    {
      icon: <ClipboardList size={36} className="text-success" />,
      titulo: 'Ver qué hay en stock',
      descripcion: 'En la pestaña "Stock" podés buscar cualquier producto y ver cuánto hay disponible.',
    },
    {
      icon: <CheckCircle size={36} className="text-success" />,
      titulo: '¡Listo para empezar!',
      descripcion: 'Simple y rápido. Si algo no cuadra con el stock, el sistema lo va a mostrar como discrepancia para que el encargado lo revise.',
    },
  ],

  deposito: [
    {
      icon: <Warehouse size={36} className="text-primary" />,
      titulo: 'Bienvenido al sistema de stock',
      descripcion: 'Tu rol es Depósito. Sos el responsable de recibir mercadería y mantener el stock controlado.',
      tip: 'Cuando te asignen una orden de compra, vas a verla directamente al entrar.',
    },
    {
      icon: <Bell size={36} className="text-warning" />,
      titulo: 'Tus tareas aparecen al inicio',
      descripcion: 'Cada vez que el admin te asigne una entrega pendiente, vas a ver un aviso amarillo al entrar. Hacé click para ver el detalle y confirmar la recepción.',
      tip: 'Quedás como responsable hasta que la recepción esté confirmada.',
    },
    {
      icon: <ScanBarcode size={36} className="text-primary" />,
      titulo: 'Control con scanner',
      descripcion: 'Podés usar el lector de código de barras para hacer un conteo rápido de cualquier depósito. El sistema compara automáticamente con el stock teórico.',
      tip: 'Accedé desde "Control" en la barra inferior o desde el inicio.',
    },
    {
      icon: <CheckCircle size={36} className="text-success" />,
      titulo: '¡Todo listo!',
      descripcion: 'Recordá: lo que recibís, lo que transferís y lo que reportás — todo queda registrado con tu nombre y hora exacta.',
    },
  ],

  compras: [
    {
      icon: <ShoppingCart size={36} className="text-primary" />,
      titulo: 'Bienvenido al sistema de stock',
      descripcion: 'Tu rol es Compras. Podés crear y gestionar órdenes de compra, asignar responsables y hacer seguimiento de recepciones.',
      tip: 'Podés asignar cualquier usuario como responsable de recibir una entrega.',
    },
    {
      icon: <ShoppingCart size={36} className="text-warning" />,
      titulo: 'Órdenes de compra',
      descripcion: 'En "Órdenes" creás el pedido, elegís el proveedor, los ítems y asignás quién lo recibe. Esa persona ve la tarea al iniciar sesión.',
    },
    {
      icon: <ClipboardList size={36} className="text-success" />,
      titulo: 'Stock y reportes',
      descripcion: 'Tenés acceso a todo el stock en tiempo real y a los reportes de movimientos, mermas e ingresos del mes.',
    },
    {
      icon: <CheckCircle size={36} className="text-success" />,
      titulo: '¡Listo para operar!',
      descripcion: 'Si tenés dudas sobre el stock de algún depósito, consultá "Discrepancias" para ver el semáforo de cada uno.',
    },
  ],

  admin: [
    {
      icon: <LayoutDashboard size={36} className="text-primary" />,
      titulo: 'Bienvenido al panel de administración',
      descripcion: 'Tenés acceso total al sistema: stock, movimientos, órdenes de compra, usuarios, depósitos y reportes completos.',
    },
    {
      icon: <ShoppingCart size={36} className="text-warning" />,
      titulo: 'Órdenes y responsabilidades',
      descripcion: 'Podés crear órdenes de compra y asignar un responsable. Esa persona ve la tarea al entrar a su cuenta y queda registrada hasta confirmar la recepción.',
      tip: 'Ideal para delegar sin perder trazabilidad.',
    },
    {
      icon: <Bell size={36} className="text-destructive" />,
      titulo: 'Alertas automáticas',
      descripcion: 'El dashboard te muestra discrepancias graves (rojo) y órdenes pendientes. En "Discrepancias" podés ver el detalle por depósito con semáforo.',
    },
    {
      icon: <CheckCircle size={36} className="text-success" />,
      titulo: '¡Todo bajo control!',
      descripcion: 'Podés configurar permisos por usuario en la sección "Usuarios", y asignarle un depósito por defecto para agilizar su trabajo.',
      tip: 'Los usuarios ven solo las secciones que vos les habilitás.',
    },
  ],
};

// Scope por workspace + usuario — si un staff de Org A se llama igual que
// uno de Org B (o comparten id=1), el onboarding se saltaría erróneamente
// en la segunda org.
import { scopedKey } from '../lib/scopedStorage';
function storageKey(userId: number) {
  return scopedKey('onboarding_done_v1', userId);
}

export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem(storageKey(user.id));
    if (!done) {
      // Pequeño delay para que la app cargue primero
      setTimeout(() => setVisible(true), 600);
    }
  }, [user?.id]);

  if (!user || !visible) return null;

  const steps = STEPS_POR_ROL[user.rol] || STEPS_POR_ROL['admin'];
  const current = steps[step];
  const esFinal = step === steps.length - 1;

  const cerrar = () => {
    setSaliendo(true);
    localStorage.setItem(storageKey(user.id), '1');
    setTimeout(() => setVisible(false), 300);
  };

  const siguiente = () => {
    if (esFinal) {
      cerrar();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className={`fixed inset-0 z-[300] flex items-end sm:items-center justify-center transition-opacity duration-300 ${saliendo ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={cerrar} />

      {/* Card */}
      <div className="relative w-full sm:max-w-md mx-4 sm:mx-auto bg-surface rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden">

        {/* Barra de progreso */}
        <div className="h-1 bg-surface-high">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Botón saltar */}
        <button
          onClick={cerrar}
          className="absolute top-4 right-4 p-1.5 rounded-full text-on-surface-variant hover:bg-surface-high hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>

        {/* Contenido */}
        <div className="px-6 pt-8 pb-6">
          {/* Icono */}
          <div className="w-16 h-16 rounded-2xl bg-surface-high flex items-center justify-center mb-5">
            {current.icon}
          </div>

          {/* Texto */}
          <h2 className="text-lg font-extrabold text-foreground mb-2">{current.titulo}</h2>
          <p className="text-sm text-on-surface-variant font-medium leading-relaxed">{current.descripcion}</p>

          {/* Tip */}
          {current.tip && (
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-xs font-bold text-primary">💡 {current.tip}</p>
            </div>
          )}

          {/* Dots + botón */}
          <div className="flex items-center justify-between mt-6">
            {/* Indicadores de paso */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-5 h-2 bg-primary'
                      : i < step
                        ? 'w-2 h-2 bg-primary/40'
                        : 'w-2 h-2 bg-surface-high'
                  }`}
                />
              ))}
            </div>

            {/* Botón siguiente / empezar */}
            <button
              onClick={siguiente}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-black font-extrabold text-sm hover:bg-primary/90 active:scale-95 transition-all"
            >
              {esFinal ? '¡Empezar!' : 'Siguiente'}
              {!esFinal && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
