import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { BACKEND_DOWN_EVENT, BACKEND_UP_EVENT } from '../lib/api';

// Banner global que aparece arriba de la app cuando el backend o la DB
// dejan de responder. Evita que el cliente vea empty states silenciosos
// ("Todavía no hay listas de precios", "Sin datos", etc) cuando en
// realidad la data existe pero la infraestructura está temporalmente
// inaccesible — lo que confunde y hace pensar que se perdieron datos.
//
// Se auto-oculta cuando vuelve un request exitoso (BACKEND_UP_EVENT).
// El usuario también puede descartarlo manualmente por sesión.
type Estado = null | { kind: 'network' | 'db' | 'server'; at: number; message?: string };

export default function BackendStatusBanner() {
  const [estado, setEstado] = useState<Estado>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onDown = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setEstado({ kind: detail.kind || 'server', at: Date.now(), message: detail.message });
      setDismissed(false);
    };
    const onUp = () => setEstado(null);
    window.addEventListener(BACKEND_DOWN_EVENT, onDown as any);
    window.addEventListener(BACKEND_UP_EVENT, onUp as any);
    return () => {
      window.removeEventListener(BACKEND_DOWN_EVENT, onDown as any);
      window.removeEventListener(BACKEND_UP_EVENT, onUp as any);
    };
  }, []);

  if (!estado || dismissed) return null;

  const titulo =
    estado.kind === 'db' ? 'Base de datos inaccesible'
    : estado.kind === 'network' ? 'Sin conexión al servidor'
    : 'Servidor con problemas';

  const detalle =
    estado.kind === 'db'
      ? 'Tus datos están intactos pero el servidor no puede leerlos ahora. Es un problema temporal de infraestructura, no una pérdida. Reintentá en un minuto.'
      : estado.kind === 'network'
      ? 'No podemos contactar al servidor. Revisá tu conexión a internet o esperá unos segundos.'
      : 'El servidor está respondiendo con errores. Reintentamos automáticamente; si persiste, avisá al soporte.';

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500/95 text-amber-950 shadow-lg backdrop-blur-sm border-b border-amber-600/40">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-tight">{titulo}</p>
          <p className="text-[11px] leading-snug mt-0.5 opacity-90">{detalle}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-900/15 hover:bg-amber-900/25 text-[11px] font-bold"
          title="Recargar la página"
        >
          <RefreshCw size={12} /> Reintentar
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-md hover:bg-amber-900/15"
          title="Cerrar aviso"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
