import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight } from 'lucide-react';
import {
  ClipboardList, ArrowRightLeft, ShoppingCart, ScanBarcode,
  ClipboardCheck, AlertTriangle, Users, Package, Warehouse,
  ChefHat, Truck, BarChart3, Upload, Link2
} from 'lucide-react';
import { usePageOnboarding } from '../hooks/usePageOnboarding';

interface TourStep {
  icon: React.ReactNode;
  titulo: string;
  descripcion: string;
  tip?: string;
}

const PAGE_STEPS: Record<string, TourStep[]> = {
  stock: [
    {
      icon: <ClipboardList size={30} className="text-primary" />,
      titulo: 'Vista de Stock',
      descripcion: 'Acá ves el stock actual de todos los productos en cada depósito. Los números en rojo indican que el producto está por debajo del mínimo configurado.',
      tip: 'Usá el buscador para encontrar un producto rápidamente entre cientos.',
    },
    {
      icon: <ClipboardList size={30} className="text-warning" />,
      titulo: 'Filtros disponibles',
      descripcion: 'Podés filtrar por depósito o estado. Si un producto tiene stock en varios depósitos, aparece una fila por cada uno.',
    },
  ],

  movimientos: [
    {
      icon: <ArrowRightLeft size={30} className="text-primary" />,
      titulo: 'Registro de movimientos',
      descripcion: 'Cada ingreso, egreso, merma, transferencia o ajuste queda registrado acá con fecha, hora y usuario. Es la trazabilidad completa de todo lo que pasó en el stock.',
      tip: 'El botón "Registrar movimiento" abre un formulario rápido. Si tenés varios seguidos, usá el Dashboard → "Modo continuo".',
    },
    {
      icon: <ArrowRightLeft size={30} className="text-blue-400" />,
      titulo: 'Tipos de movimiento',
      descripcion: 'Ingreso suma al stock. Merma, consumo interno y elaboración restan. Transferencia mueve entre depósitos. Ajuste corrige manualmente el stock.',
    },
    {
      icon: <ArrowRightLeft size={30} className="text-success" />,
      titulo: 'Responsable opcional',
      descripcion: 'Podés asignar un responsable distinto al que registra. Útil cuando delegás una tarea — el sistema recuerda quién es responsable de cada movimiento.',
    },
  ],

  'ordenes-compra': [
    {
      icon: <ShoppingCart size={30} className="text-primary" />,
      titulo: 'Órdenes de compra',
      descripcion: 'Creá pedidos a proveedores, asignales un responsable de recepción y hacé seguimiento hasta que llegue la mercadería. El estado cambia automáticamente.',
      tip: 'Cuando asignás un responsable, esa persona ve la tarea directamente al entrar al sistema.',
    },
    {
      icon: <ShoppingCart size={30} className="text-success" />,
      titulo: 'Recibir mercadería',
      descripcion: 'Al confirmar la recepción, escribís la cantidad real recibida por ítem. El sistema genera los movimientos de ingreso al stock automáticamente.',
      tip: '"Recibir todo como pedido" completa todos los campos de una vez si llegó todo correcto.',
    },
  ],

  'control-scanner': [
    {
      icon: <ScanBarcode size={30} className="text-primary" />,
      titulo: 'Control con scanner',
      descripcion: 'Elegí un depósito e iniciá un control. Escaneá los códigos de barras o buscá los productos. El sistema compara en tiempo real lo contado con el stock teórico.',
      tip: 'El campo de escaneo está siempre activo — solo apuntá el lector y disparar.',
    },
    {
      icon: <ScanBarcode size={30} className="text-success" />,
      titulo: 'Colores de resultado',
      descripcion: 'Verde = coincide exacto. Rojo = falta. Amarillo = hay más de lo esperado. Al finalizar podés guardar como inventario y el sistema registra las discrepancias.',
    },
  ],

  inventarios: [
    {
      icon: <ClipboardCheck size={30} className="text-primary" />,
      titulo: 'Inventarios cerrados',
      descripcion: 'Cada vez que cerrás un control desde "Control Scanner", se guarda un inventario acá. Podés ver el historial completo de controles por depósito.',
      tip: 'Los inventarios cerrados no se pueden editar — son el registro oficial de cada conteo.',
    },
    {
      icon: <ClipboardCheck size={30} className="text-warning" />,
      titulo: 'Diferencias y ajustes',
      descripcion: 'Si hubo diferencias al cerrar el inventario, el sistema puede generar automáticamente ajustes de stock para cuadrar lo contado con lo teórico.',
    },
  ],

  discrepancias: [
    {
      icon: <AlertTriangle size={30} className="text-destructive" />,
      titulo: 'Dashboard de discrepancias',
      descripcion: 'Vista rápida del estado de cada depósito. Rojo = discrepancia grave. Amarillo = diferencia menor. Verde = todo cuadra con el último inventario.',
      tip: 'Click en cualquier depósito para ver exactamente qué productos tienen diferencia.',
    },
    {
      icon: <AlertTriangle size={30} className="text-warning" />,
      titulo: 'Responsabilidad clara',
      descripcion: 'Cada discrepancia muestra quién fue el último en tocar ese producto y en qué movimiento. Facilita la investigación sin apuntar a nadie sin evidencia.',
    },
  ],

  usuarios: [
    {
      icon: <Users size={30} className="text-primary" />,
      titulo: 'Gestión de usuarios',
      descripcion: 'Creá y editá los usuarios del sistema. Cada usuario tiene un rol que define qué secciones ve y qué puede hacer.',
      tip: 'Asignale un depósito por defecto para que el sistema pre-complete ese depósito en sus formularios.',
    },
    {
      icon: <Users size={30} className="text-blue-400" />,
      titulo: 'Roles disponibles',
      descripcion: 'Admin ve todo. Compras gestiona órdenes. Depósito recibe mercadería y hace controles. Cocina y Barra registran consumos y mermas desde el Dashboard.',
    },
  ],

  productos: [
    {
      icon: <Package size={30} className="text-primary" />,
      titulo: 'Catálogo de productos',
      descripcion: 'El maestro de todos los productos del negocio. Cada uno tiene código, unidad de medida, stock mínimo y depósito por defecto.',
      tip: 'El código de barras vincula el producto con el lector de scanner para el control de stock.',
    },
    {
      icon: <Package size={30} className="text-warning" />,
      titulo: 'Stock mínimo',
      descripcion: 'Configurando un stock mínimo, el sistema resalta en rojo ese producto cuando cae por debajo. Ideal para productos críticos como vinos o insumos clave.',
    },
  ],

  depositos: [
    {
      icon: <Warehouse size={30} className="text-primary" />,
      titulo: 'Depósitos / Ubicaciones',
      descripcion: 'Cada lugar donde se guarda mercadería es un depósito: Bodega, Cocina, Barra, Freezer, etc. El stock se lleva por separado en cada uno.',
      tip: 'Asignale un depósito por defecto a cada usuario para agilizar el registro de movimientos.',
    },
  ],

  recetas: [
    {
      icon: <ChefHat size={30} className="text-primary" />,
      titulo: 'Recetas de elaboración',
      descripcion: 'Definí qué ingredientes necesita cada preparación. Al registrar una elaboración en movimientos, el sistema descuenta los insumos automáticamente.',
      tip: 'Las recetas mantienen la trazabilidad del costo de producción.',
    },
  ],

  proveedores: [
    {
      icon: <Truck size={30} className="text-primary" />,
      titulo: 'Proveedores',
      descripcion: 'El directorio de todos tus proveedores. Se usan al crear órdenes de compra para asociar cada pedido al proveedor correspondiente.',
    },
  ],

  reportes: [
    {
      icon: <BarChart3 size={30} className="text-primary" />,
      titulo: 'Reportes y análisis',
      descripcion: 'Consultá mermas del mes, movimientos por producto, consumos por período. Los reportes te dan visibilidad sobre costos y tendencias.',
      tip: 'Filtrá por fecha y tipo de movimiento para análisis específicos.',
    },
  ],

  importar: [
    {
      icon: <Upload size={30} className="text-primary" />,
      titulo: 'Importar productos',
      descripcion: 'Cargá un CSV para crear o actualizar productos en masa. Ideal para la carga inicial o actualización de precios y unidades de muchos productos a la vez.',
      tip: 'Descargá la plantilla de ejemplo para asegurarte de usar el formato correcto.',
    },
  ],

  vincular: [
    {
      icon: <Link2 size={30} className="text-primary" />,
      titulo: 'Vincular códigos de barras',
      descripcion: 'Asociá códigos de barras a productos que aún no los tienen. Escaneá el código y luego buscá el producto para vincularlos.',
      tip: 'Una vez vinculado, el producto aparece en el control de scanner al escanear ese código.',
    },
  ],
};

interface Props {
  pageKey: string;
}

export default function PageTour({ pageKey }: Props) {
  const { show, dismiss } = usePageOnboarding(pageKey);
  const steps = PAGE_STEPS[pageKey];

  if (!show || !steps) return null;

  return <TourModal steps={steps} onDone={dismiss} />;
}

function TourModal({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [saliendo, setSaliendo] = useState(false);

  const cerrar = () => {
    setSaliendo(true);
    setTimeout(onDone, 280);
  };

  const siguiente = () => {
    if (step === steps.length - 1) {
      cerrar();
    } else {
      setStep(s => s + 1);
    }
  };

  const current = steps[step];
  const esFinal = step === steps.length - 1;
  const single = steps.length === 1;

  // Portal a document.body: evitamos que el `.page-enter` (que tiene
  // transform) cree un containing block y rompa el fixed inset-0.
  return createPortal(
    <div className={`fixed inset-0 z-[250] flex items-end sm:items-center justify-center transition-opacity duration-300 ${saliendo ? 'opacity-0' : 'opacity-100'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={cerrar} />
      <div className="relative w-full sm:max-w-sm mx-4 sm:mx-auto bg-surface rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-surface-high">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: single ? '100%' : `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <button
          onClick={cerrar}
          className="absolute top-3 right-3 p-1.5 rounded-full text-on-surface-variant hover:bg-surface-high transition-colors"
        >
          <X size={15} />
        </button>

        <div className="px-5 pt-6 pb-5">
          <div className="w-12 h-12 rounded-xl bg-surface-high flex items-center justify-center mb-4">
            {current.icon}
          </div>
          <h3 className="text-base font-extrabold text-foreground mb-1.5">{current.titulo}</h3>
          <p className="text-sm text-on-surface-variant font-medium leading-relaxed">{current.descripcion}</p>
          {current.tip && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-xs font-bold text-primary">💡 {current.tip}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-5">
            {/* Dot indicators */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-4 h-1.5 bg-primary'
                      : i < step
                        ? 'w-1.5 h-1.5 bg-primary/40'
                        : 'w-1.5 h-1.5 bg-surface-high'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={siguiente}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black font-extrabold text-sm hover:bg-primary/90 active:scale-95 transition-all"
            >
              {esFinal ? 'Entendido' : 'Siguiente'}
              {!esFinal && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
