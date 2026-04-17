import { useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';
import { api, type PerfilOnboarding } from '../lib/api';
import Modal from './ui/Modal';
import Button from './ui/Button';
import {
  Users, UserCircle2, ChefHat,
  DollarSign, Archive, ShieldAlert, Phone,
  Clock, Sun, Coffee,
  Sparkles, ArrowRight, ArrowLeft, X,
} from 'lucide-react';

// ============================================================================
// OnboardingPerfilWizard
// ----------------------------------------------------------------------------
// Se muestra una sola vez, la primera vez que el owner/admin entra al
// Dashboard de un workspace sin `perfilOnboarding`. Captura en 3 pasos:
//   1. Tamaño del equipo
//   2. Dolor principal del negocio
//   3. Frecuencia de uso esperada
// Todo skippable en cualquier paso ("Más tarde" visible).
//
// Lo que responde se usa para personalizar el asistente IA (contexto en el
// system prompt) y, más adelante, para priorizar tours/recomendaciones del
// Dashboard. No es un gate — se puede usar toda la app sin completarlo.
// ============================================================================

type PasoKey = 'empleados' | 'dolor' | 'frecuencia';

interface Opcion<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon: any;
}

const EMPLEADOS: Opcion<NonNullable<PerfilOnboarding['empleados']>>[] = [
  { value: 'solo_yo', label: 'Solo yo',          hint: 'Sin empleados fijos',     icon: UserCircle2 },
  { value: '2_5',     label: '2 a 5 personas',   hint: 'Equipo chico',            icon: Users },
  { value: '6_15',    label: '6 a 15 personas',  hint: 'Restaurante mediano',     icon: Users },
  { value: '16_mas',  label: '16 o más',         hint: 'Operación grande',        icon: ChefHat },
];

const DOLORES: Opcion<NonNullable<PerfilOnboarding['dolor']>>[] = [
  { value: 'costo_plato', label: 'No sé cuánto me cuesta cada plato',        hint: 'Querés margen real por producto',    icon: DollarSign },
  { value: 'merma',       label: 'Se me vence mercadería antes de usarla',   hint: 'Querés bajar desperdicio',            icon: Archive },
  { value: 'robo',        label: 'Pierdo stock sin explicación',             hint: 'Querés trazabilidad y control',       icon: ShieldAlert },
  { value: 'pedidos',     label: 'Pierdo tiempo armando pedidos',            hint: 'Querés órdenes más ágiles',           icon: Phone },
];

const FRECUENCIAS: Opcion<NonNullable<PerfilOnboarding['frecuencia']>>[] = [
  { value: 'todo_dia',   label: 'Todo el día',               hint: 'La uso en cocina / depósito',    icon: Clock },
  { value: 'rato',       label: 'Un rato por día',           hint: 'Vista de supervisor / dueño',    icon: Sun },
  { value: 'ocasional',  label: 'Solo cuando hace falta',    hint: 'Consulta puntual',               icon: Coffee },
];

export default function OnboardingPerfilWizard() {
  const { workspace, refreshWorkspaces } = useSession();
  const { user } = useAuth();

  // Estado local del wizard
  const [paso, setPaso] = useState<PasoKey>('empleados');
  const [empleados, setEmpleados] = useState<PerfilOnboarding['empleados']>(undefined);
  const [dolor, setDolor] = useState<PerfilOnboarding['dolor']>(undefined);
  const [frecuencia, setFrecuencia] = useState<PerfilOnboarding['frecuencia']>(undefined);
  const [saving, setSaving] = useState(false);
  const [dismissedSession, setDismissedSession] = useState(false);

  // Condiciones para NO mostrar el wizard (con este orden para evitar
  // flashear el modal mientras carga la sesión):
  //  - No hay workspace activo todavía
  //  - El perfil ya existe (respondido u omitido)
  //  - El usuario no es admin (empleados de cocina/barra no deben ver esto;
  //    el perfil lo setea el dueño, no el staff)
  //  - El usuario lo cerró en esta sesión (no estresar si decide volver)
  if (!workspace || !user) return null;
  if (user.rol !== 'admin') return null;
  if (workspace.perfilOnboarding) return null;
  if (dismissedSession) return null;

  // Helpers
  const pasoIdx = paso === 'empleados' ? 0 : paso === 'dolor' ? 1 : 2;
  const totalPasos = 3;

  const guardar = async (overrides?: Partial<PerfilOnboarding>) => {
    if (saving) return;
    setSaving(true);
    const payload: PerfilOnboarding = {
      empleados,
      dolor,
      frecuencia,
      ...overrides,
    };
    try {
      await api.updateWorkspacePerfil(workspace.id, payload);
      await refreshWorkspaces();
    } catch (e) {
      console.error('[OnboardingPerfilWizard] guardar', e);
      // Degradamos silenciosamente: si falla el PATCH, cerramos el modal de
      // esta sesión — no vale la pena bloquear al usuario por un wizard
      // opcional. La próxima vez que entre se vuelve a mostrar.
      setDismissedSession(true);
    }
    setSaving(false);
  };

  const omitir = async () => {
    await guardar({ skipped: true });
    setDismissedSession(true);
  };

  const avanzar = () => {
    if (paso === 'empleados' && empleados) setPaso('dolor');
    else if (paso === 'dolor' && dolor) setPaso('frecuencia');
  };

  const retroceder = () => {
    if (paso === 'frecuencia') setPaso('dolor');
    else if (paso === 'dolor') setPaso('empleados');
  };

  const puedeAvanzar =
    (paso === 'empleados' && !!empleados) ||
    (paso === 'dolor' && !!dolor) ||
    (paso === 'frecuencia' && !!frecuencia);

  const esUltimoPaso = paso === 'frecuencia';

  const finalizar = async () => {
    await guardar();
    setDismissedSession(true);
  };

  // Render de una opción (card clickeable grande, touch-friendly)
  function OpcionCard<T extends string>(props: {
    opcion: Opcion<T>;
    selected: boolean;
    onClick: () => void;
  }) {
    const { opcion, selected, onClick } = props;
    const Icon = opcion.icon;
    return (
      <button
        onClick={onClick}
        className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
          selected
            ? 'bg-primary/10 border-primary text-foreground'
            : 'bg-surface-high border-transparent hover:border-border text-foreground'
        }`}
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          selected ? 'bg-primary/20 text-primary' : 'bg-surface text-on-surface-variant'
        }`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">{opcion.label}</p>
          {opcion.hint && <p className="text-[11px] text-on-surface-variant mt-0.5">{opcion.hint}</p>}
        </div>
      </button>
    );
  }

  return (
    <Modal open onClose={omitir} title="">
      <div className="space-y-5">
        {/* Encabezado con progress y omitir */}
        <div className="flex items-start justify-between gap-3 -mt-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                Paso {pasoIdx + 1} de {totalPasos}
              </p>
              <h2 className="text-base font-extrabold text-foreground -mt-0.5">
                Personalizá tu experiencia
              </h2>
            </div>
          </div>
          <button
            onClick={omitir}
            disabled={saving}
            className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant hover:text-foreground transition-colors disabled:opacity-50"
            title="No quiero responder ahora"
          >
            <X size={12} /> Más tarde
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-surface-high rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((pasoIdx + 1) / totalPasos) * 100}%` }}
          />
        </div>

        {/* Cuerpo por paso */}
        {paso === 'empleados' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-foreground">¿Cuántas personas trabajan en tu negocio?</p>
              <p className="text-xs text-on-surface-variant mt-1">Nos ayuda a mostrarte solo las funciones que vas a usar.</p>
            </div>
            <div className="space-y-2">
              {EMPLEADOS.map(o => (
                <OpcionCard key={o.value} opcion={o} selected={empleados === o.value} onClick={() => setEmpleados(o.value)} />
              ))}
            </div>
          </div>
        )}

        {paso === 'dolor' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-foreground">¿Qué es lo que más te duele hoy?</p>
              <p className="text-xs text-on-surface-variant mt-1">Elegí el problema principal — el asistente IA te va a guiar a resolverlo primero.</p>
            </div>
            <div className="space-y-2">
              {DOLORES.map(o => (
                <OpcionCard key={o.value} opcion={o} selected={dolor === o.value} onClick={() => setDolor(o.value)} />
              ))}
            </div>
          </div>
        )}

        {paso === 'frecuencia' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-foreground">¿Cuánto pensás usar la app por día?</p>
              <p className="text-xs text-on-surface-variant mt-1">Ajustamos la vista de inicio según tu uso esperado.</p>
            </div>
            <div className="space-y-2">
              {FRECUENCIAS.map(o => (
                <OpcionCard key={o.value} opcion={o} selected={frecuencia === o.value} onClick={() => setFrecuencia(o.value)} />
              ))}
            </div>
          </div>
        )}

        {/* Navegación */}
        <div className="flex items-center justify-between gap-2 pt-2">
          {pasoIdx > 0 ? (
            <Button variant="secondary" size="sm" onClick={retroceder} disabled={saving}>
              <ArrowLeft size={14} /> Atrás
            </Button>
          ) : (
            <div />
          )}

          {esUltimoPaso ? (
            <Button onClick={finalizar} disabled={!puedeAvanzar || saving}>
              {saving ? 'Guardando…' : <>Listo <Sparkles size={14} /></>}
            </Button>
          ) : (
            <Button onClick={avanzar} disabled={!puedeAvanzar || saving}>
              Siguiente <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
