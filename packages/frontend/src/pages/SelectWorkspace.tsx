import { useState, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { api, type WorkspaceTemplateSummary } from '../lib/api';
import Button from '../components/ui/Button';
import {
  Store, ChefHat, Fish, Wine, Pizza, Coffee, FileText,
  ArrowLeft, Plus, Sparkles, Package, Warehouse, LogOut,
  type LucideIcon,
} from 'lucide-react';

// ============================================================================
// SelectWorkspace — stage 1 → stage 2
// ============================================================================
// Pantalla de selección/creación de workspace. Tiene 3 vistas:
//
//   'list'     → lista de workspaces existentes + botón "Nuevo"
//   'template' → wizard paso 1: elegir rubro (kiosco, resto, sushi, ...)
//   'naming'   → wizard paso 2: nombrar el workspace + crear
//
// La idea del wizard es bajar la fricción de onboarding: en vez de entrar a
// una app vacía, el user elige su rubro y ya tiene 3-5 depósitos + 20-30
// productos precargados. Los templates viven estáticos en el backend
// (/api/cuenta/templates) — cero LLM, 100% determinístico.
// ============================================================================

type View = 'list' | 'template' | 'naming';

// Mapa nombre→componente para los íconos que declaran los templates. El
// backend solo manda un string (ej: 'Store'), así que acá lo resolvemos al
// componente React real. Si aparece uno nuevo en el backend que no esté acá,
// cae a <Package> como fallback seguro.
const ICON_MAP: Record<string, LucideIcon> = {
  Store, ChefHat, Fish, Wine, Pizza, Coffee, FileText,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Package;
}

export default function SelectWorkspace() {
  const { workspaces, selectWorkspace, createWorkspace, cuenta, logout } = useSession();
  const [view, setView] = useState<View>('list');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Wizard state
  const [templates, setTemplates] = useState<WorkspaceTemplateSummary[]>([]);
  const [loadingTpls, setLoadingTpls] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<WorkspaceTemplateSummary | null>(null);
  const [wsName, setWsName] = useState('');

  // Cargar templates cuando el user entra al wizard por primera vez
  useEffect(() => {
    if (view !== 'template' || templates.length > 0) return;
    let cancelled = false;
    setLoadingTpls(true);
    api.listTemplates()
      .then(tpls => { if (!cancelled) setTemplates(tpls); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Error al cargar plantillas'); })
      .finally(() => { if (!cancelled) setLoadingTpls(false); });
    return () => { cancelled = true; };
  }, [view, templates.length]);

  const handleSelect = async (orgId: number) => {
    setError('');
    setBusy(orgId);
    try {
      await selectWorkspace(orgId);
    } catch (err: any) {
      setError(err?.message || 'Error al entrar al workspace');
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    if (!wsName.trim() || !selectedTpl) return;
    setError('');
    setBusy(-1);
    try {
      const ws = await createWorkspace(wsName.trim(), selectedTpl.id);
      await selectWorkspace(ws.id);
    } catch (err: any) {
      setError(err?.message || 'Error al crear workspace');
      setBusy(null);
    }
  };

  const resetWizard = () => {
    setView('list');
    setSelectedTpl(null);
    setWsName('');
    setError('');
  };

  // ── Branding header común a todas las vistas ─────────────────────────────
  const Header = (
    <div className="text-center mb-8">
      <div className="text-xl font-extrabold tracking-tight text-foreground">
        OPS<span className="text-gold-gradient">TERMINAL</span>
      </div>
      <p className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.2em] mt-1">
        Stock Gastro
      </p>
      {cuenta && view === 'list' && (
        <p className="text-xs text-on-surface-variant mt-4 font-semibold">
          {cuenta.nombre} · <span className="text-on-surface-variant/60">{cuenta.email}</span>
        </p>
      )}
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: 'list' — lista de workspaces existentes
  // ──────────────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass rounded-2xl p-6 w-full max-w-md">
          {Header}
          <p className="text-center text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em] mb-4">
            Elegí un workspace
          </p>

          {error && (
            <p className="text-xs text-destructive text-center font-semibold mb-3">{error}</p>
          )}

          <div className="space-y-2 mb-4">
            {workspaces.map(w => (
              <button
                key={w.id}
                disabled={busy !== null}
                onClick={() => handleSelect(w.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-surface-high hover:border-primary/30 transition-all text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {w.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{w.nombre}</p>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    {w.plan} · {w.rol} · {w.estadoSuscripcion}
                  </p>
                </div>
                {busy === w.id && (
                  <span className="text-[10px] text-primary font-bold uppercase">Cargando</span>
                )}
              </button>
            ))}

            {workspaces.length === 0 && (
              <p className="text-center text-sm text-on-surface-variant py-6">
                Aún no tenés workspaces. Creá el primero.
              </p>
            )}
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setView('template')}
          >
            <Plus size={15} className="mr-1.5" />
            Nuevo workspace
          </Button>

          <div className="mt-6 pt-4 border-t border-border text-center">
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-destructive uppercase tracking-widest"
            >
              <LogOut size={12} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: 'template' — grid de templates de rubro (paso 1 del wizard)
  // ──────────────────────────────────────────────────────────────────────────
  if (view === 'template') {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-5xl mx-auto">
          {Header}

          {/* Breadcrumb / título del paso */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold text-primary/70 uppercase tracking-[0.2em] mb-3">
              <Sparkles size={12} />
              Nuevo workspace · Paso 1 de 2
            </div>
            <h1 className="font-display italic text-4xl lg:text-5xl leading-[0.95] text-foreground tracking-tight mb-3">
              ¿Qué tipo de negocio es?
            </h1>
            <p className="text-sm text-on-surface-variant max-w-xl mx-auto">
              Elegí un rubro y precargamos depósitos y productos típicos. Después los ajustás como quieras.
            </p>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center font-semibold mb-4">{error}</p>
          )}

          {loadingTpls ? (
            <p className="text-center text-sm text-on-surface-variant py-12">Cargando plantillas...</p>
          ) : (
            <>
              {/* Grid de templates (excluye "vacio", que va aparte) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {templates.filter(t => t.id !== 'vacio').map(tpl => {
                  const Icon = resolveIcon(tpl.icono);
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => { setSelectedTpl(tpl); setView('naming'); }}
                      className="group relative text-left p-6 rounded-xl border border-border hover:border-primary/50 bg-surface/40 hover:bg-surface-high/60 transition-all hover:-translate-y-0.5"
                    >
                      {/* Ícono con tint del color del template */}
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-105"
                        style={{
                          background: `${tpl.color}18`,
                          color: tpl.color,
                        }}
                      >
                        <Icon size={22} strokeWidth={1.75} />
                      </div>
                      <h3 className="font-display italic text-2xl leading-tight text-foreground mb-1.5">
                        {tpl.nombre}
                      </h3>
                      <p className="text-[12px] text-on-surface-variant leading-relaxed mb-4 min-h-[32px]">
                        {tpl.descripcion}
                      </p>

                      {/* Stats inline */}
                      <div className="flex items-center gap-3 mb-3 text-[10px] font-mono uppercase tracking-wider text-on-surface-variant/70">
                        <span className="flex items-center gap-1">
                          <Warehouse size={11} />
                          {tpl.totalDepositos} dep
                        </span>
                        <span className="text-border">·</span>
                        <span className="flex items-center gap-1">
                          <Package size={11} />
                          {tpl.totalProductos} prod
                        </span>
                      </div>

                      {/* Preview de productos */}
                      <div className="pt-3 border-t border-border/60">
                        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/50 mb-1.5">
                          Ejemplos
                        </p>
                        <p className="text-[11px] text-on-surface-variant/80 leading-snug line-clamp-2">
                          {tpl.previewProductos.slice(0, 4).join(' · ')}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Opción "empezar vacío" — menos prominente, es el escape hatch */}
              {templates.find(t => t.id === 'vacio') && (
                <button
                  onClick={() => {
                    const vacio = templates.find(t => t.id === 'vacio')!;
                    setSelectedTpl(vacio);
                    setView('naming');
                  }}
                  className="w-full p-4 rounded-lg border border-dashed border-border hover:border-on-surface-variant/50 hover:bg-surface/40 transition-all text-center"
                >
                  <p className="text-[13px] font-semibold text-on-surface-variant">
                    <FileText size={13} className="inline mr-1.5 -mt-0.5" />
                    ¿Tu rubro no está? Empezá con un workspace vacío
                  </p>
                </button>
              )}
            </>
          )}

          {/* Volver */}
          <div className="mt-8 text-center">
            <button
              onClick={resetWizard}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-foreground uppercase tracking-widest"
            >
              <ArrowLeft size={12} />
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: 'naming' — nombre del workspace + preview (paso 2 del wizard)
  // ──────────────────────────────────────────────────────────────────────────
  if (view === 'naming' && selectedTpl) {
    const Icon = resolveIcon(selectedTpl.icono);
    const isVacio = selectedTpl.id === 'vacio';
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-2xl mx-auto">
          {Header}

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold text-primary/70 uppercase tracking-[0.2em] mb-3">
              <Sparkles size={12} />
              Nuevo workspace · Paso 2 de 2
            </div>
            <h1 className="font-display italic text-4xl lg:text-5xl leading-[0.95] text-foreground tracking-tight">
              Ponele un nombre
            </h1>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center font-semibold mb-4">{error}</p>
          )}

          {/* Card resumen del template elegido */}
          <div className="glass rounded-xl p-6 mb-6">
            <div className="flex items-start gap-4 mb-5">
              <div
                className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: `${selectedTpl.color}18`,
                  color: selectedTpl.color,
                }}
              >
                <Icon size={26} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70 mb-1">
                  Rubro elegido
                </p>
                <h3 className="font-display italic text-3xl leading-tight text-foreground mb-1">
                  {selectedTpl.nombre}
                </h3>
                <p className="text-[12px] text-on-surface-variant leading-relaxed">
                  {selectedTpl.descripcion}
                </p>
              </div>
            </div>

            {!isVacio && (
              <>
                <div className="hairline mb-4" />
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/50 mb-1">
                      Depósitos
                    </p>
                    <p className="text-2xl font-display italic text-foreground">
                      {selectedTpl.totalDepositos}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/50 mb-1">
                      Productos
                    </p>
                    <p className="text-2xl font-display italic text-foreground">
                      {selectedTpl.totalProductos}
                    </p>
                  </div>
                </div>
                {selectedTpl.rubros.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/50 mb-2">
                      Rubros cubiertos
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTpl.rubros.map(r => (
                        <span
                          key={r}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input de nombre + CTA */}
          <div className="glass rounded-xl p-6">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
              Nombre del workspace
            </label>
            <input
              type="text"
              value={wsName}
              onChange={e => setWsName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full px-4 py-3 rounded-lg bg-surface-high border border-border text-foreground text-base focus:outline-none focus:border-primary transition-colors mb-4"
              placeholder={
                selectedTpl.id === 'kiosco'       ? 'Ej: Kiosco La Esquina' :
                selectedTpl.id === 'restaurante'  ? 'Ej: Parrilla Don Pepe' :
                selectedTpl.id === 'sushi'        ? 'Ej: Sakura Sushi' :
                selectedTpl.id === 'bar'          ? 'Ej: Bar Notable' :
                selectedTpl.id === 'pizzeria'     ? 'Ej: Pizzería La Farola' :
                selectedTpl.id === 'cafeteria'    ? 'Ej: Café Martinez Centro' :
                'Ej: Mi negocio'
              }
              autoFocus
              disabled={busy !== null}
            />

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setView('template')}
                disabled={busy !== null}
              >
                <ArrowLeft size={14} className="mr-1" />
                Volver
              </Button>
              <Button
                type="button"
                className="flex-[2]"
                onClick={handleCreate}
                disabled={busy !== null || !wsName.trim()}
              >
                {busy === -1
                  ? 'Creando...'
                  : isVacio
                    ? 'Crear workspace'
                    : `Crear y precargar`}
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={resetWizard}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-foreground uppercase tracking-widest"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
