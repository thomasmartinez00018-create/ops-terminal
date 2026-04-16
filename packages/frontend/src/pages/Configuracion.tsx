import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle, RefreshCw, ShieldAlert, Package, Warehouse, Users, Truck, ChefHat, ArrowRightLeft, ClipboardCheck, ShoppingCart, ListTodo, FlaskConical, FileText, DollarSign, Tag, Edit2, Check, X } from 'lucide-react';

interface Stats {
  maestros: { productos: number; depositos: number; usuarios: number; proveedores: number; recetas: number };
  operativos: { movimientos: number; inventarios: number; ordenesCompra: number; tareas: number; elaboraciones: number; facturas: number; pagos: number };
}

// Doble confirmación: el usuario debe escribir exactamente esta frase
const CONFIRM_OPERATIVO = 'BORRAR DATOS';
const CONFIRM_TOTAL = 'RESETEO TOTAL';

export default function Configuracion() {
  const { addToast } = useToast();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Reseteo operativo
  const [confirmOp, setConfirmOp] = useState('');
  const [loadingOp, setLoadingOp] = useState(false);
  const [showConfirmOp, setShowConfirmOp] = useState(false);

  // Reseteo total
  const [confirmTot, setConfirmTot] = useState('');
  const [loadingTot, setLoadingTot] = useState(false);
  const [showConfirmTot, setShowConfirmTot] = useState(false);

  // Rubros CRUD
  const [rubros, setRubros] = useState<{ rubro: string; cantProductos: number }[]>([]);
  const [loadingRubros, setLoadingRubros] = useState(false);
  const [editandoRubro, setEditandoRubro] = useState<string | null>(null);
  const [draftRubro, setDraftRubro] = useState('');
  const [renombrando, setRenombrando] = useState(false);

  const cargarRubros = async () => {
    setLoadingRubros(true);
    try {
      const data = await api.getRubrosConConteo();
      setRubros(data);
    } catch { }
    setLoadingRubros(false);
  };

  useEffect(() => { cargarRubros(); }, []);

  const iniciarEdicion = (rubro: string) => {
    setEditandoRubro(rubro);
    setDraftRubro(rubro);
  };

  const cancelarEdicion = () => {
    setEditandoRubro(null);
    setDraftRubro('');
  };

  const confirmarRename = async (rubroViejo: string) => {
    const nuevo = draftRubro.trim();
    if (!nuevo || nuevo === rubroViejo) {
      cancelarEdicion();
      return;
    }
    setRenombrando(true);
    try {
      const r = await api.renameRubro(rubroViejo, nuevo);
      addToast(`Rubro renombrado en ${r.actualizados} producto${r.actualizados === 1 ? '' : 's'}`);
      cancelarEdicion();
      cargarRubros();
      cargarStats();
    } catch (e: any) {
      addToast(e?.message || 'Error al renombrar rubro', 'error');
    }
    setRenombrando(false);
  };

  const cargarStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.getConfigStats();
      setStats(data);
    } catch { }
    setLoadingStats(false);
  };

  useEffect(() => { cargarStats(); }, []);

  const ejecutarResetOperativo = async () => {
    if (confirmOp !== CONFIRM_OPERATIVO) return;
    setLoadingOp(true);
    try {
      const r = await api.resetOperativo(user!.id);
      addToast(r.mensaje || 'Datos operativos eliminados');
      setShowConfirmOp(false);
      setConfirmOp('');
      cargarStats();
    } catch (e: any) {
      addToast(e.message || 'Error', 'error');
    }
    setLoadingOp(false);
  };

  const ejecutarResetTotal = async () => {
    if (confirmTot !== CONFIRM_TOTAL) return;
    setLoadingTot(true);
    try {
      const r = await api.resetTotal(user!.id);
      addToast(r.mensaje || 'Reseteo de fábrica completado');
      setShowConfirmTot(false);
      setConfirmTot('');
      // Cerrar sesión ya que el usuario actual puede no existir más
      logout();
      navigate('/login');
    } catch (e: any) {
      addToast(e.message || 'Error', 'error');
    }
    setLoadingTot(false);
  };

  const StatCard = ({ label, value, icon: Icon, color = 'text-foreground', to }: any) => {
    const inner = (
      <>
        <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
          <Icon size={14} />
          {label}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
          {to && <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-bold">→</span>}
        </div>
      </>
    );
    if (to) return (
      <button
        onClick={() => navigate(to)}
        className="group flex items-center justify-between py-2 w-full hover:bg-surface-high/60 -mx-2 px-2 rounded-lg transition-colors"
      >
        {inner}
      </button>
    );
    return <div className="flex items-center justify-between py-2">{inner}</div>;
  };

  const totalOperativos = stats
    ? Object.values(stats.operativos).reduce((s, v) => s + v, 0)
    : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Sistema</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Configuración</h1>
      </div>

      {/* Estado de la DB */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Estado de la base de datos</h2>
          <button
            onClick={cargarStats}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-foreground hover:bg-surface-high transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {loadingStats ? (
          <p className="text-sm text-on-surface-variant">Cargando...</p>
        ) : stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Maestros</p>
              <div className="divide-y divide-border/50">
                <StatCard label="Productos" value={stats.maestros.productos} icon={Package} color={stats.maestros.productos > 0 ? 'text-primary' : 'text-on-surface-variant'} to="/productos" />
                <StatCard label="Depósitos" value={stats.maestros.depositos} icon={Warehouse} to="/depositos" />
                <StatCard label="Usuarios" value={stats.maestros.usuarios} icon={Users} to="/usuarios" />
                <StatCard label="Proveedores" value={stats.maestros.proveedores} icon={Truck} to="/proveedores" />
                <StatCard label="Recetas" value={stats.maestros.recetas} icon={ChefHat} to="/recetas" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-warning uppercase tracking-wider mb-2">Datos operativos</p>
              <div className="divide-y divide-border/50">
                <StatCard label="Movimientos" value={stats.operativos.movimientos} icon={ArrowRightLeft} color={stats.operativos.movimientos > 0 ? 'text-warning' : 'text-on-surface-variant'} to="/movimientos" />
                <StatCard label="Inventarios" value={stats.operativos.inventarios} icon={ClipboardCheck} to="/inventarios" />
                <StatCard label="Órdenes de compra" value={stats.operativos.ordenesCompra} icon={ShoppingCart} to="/ordenes-compra" />
                <StatCard label="Facturas" value={stats.operativos.facturas} icon={FileText} to="/facturas" />
                <StatCard label="Pagos" value={stats.operativos.pagos} icon={DollarSign} to="/cuentas-por-pagar" />
                <StatCard label="Tareas" value={stats.operativos.tareas} icon={ListTodo} to="/tareas" />
                <StatCard label="Elaboraciones" value={stats.operativos.elaboraciones} icon={FlaskConical} to="/elaboraciones" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RUBROS */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-0.5">
            <Tag size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-foreground">Rubros de productos</h2>
              <button
                onClick={cargarRubros}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-foreground hover:bg-surface-high transition-colors"
                title="Refrescar"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Los rubros se crean al cargar productos. Acá podés renombrarlos — el cambio se aplica en todos los productos que lo usan.
            </p>
          </div>
        </div>

        {loadingRubros ? (
          <p className="text-sm text-on-surface-variant">Cargando rubros...</p>
        ) : rubros.length === 0 ? (
          <p className="text-sm text-on-surface-variant italic">
            Todavía no hay rubros. Creá un producto y asignale uno para empezar.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {rubros.map(({ rubro, cantProductos }) => {
              const enEdicion = editandoRubro === rubro;
              return (
                <div key={rubro} className="flex items-center gap-2 py-2">
                  {enEdicion ? (
                    <>
                      <input
                        type="text"
                        value={draftRubro}
                        onChange={e => setDraftRubro(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmarRename(rubro);
                          if (e.key === 'Escape') cancelarEdicion();
                        }}
                        autoFocus
                        disabled={renombrando}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-surface-high border-0 text-sm font-bold text-foreground placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <button
                        onClick={() => confirmarRename(rubro)}
                        disabled={renombrando || !draftRubro.trim() || draftRubro.trim() === rubro}
                        className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Confirmar"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        disabled={renombrando}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-foreground hover:bg-surface-high transition-colors disabled:opacity-30"
                        title="Cancelar"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 text-sm font-bold text-foreground truncate">{rubro}</span>
                      <span className="text-xs font-semibold text-on-surface-variant tabular-nums px-2 py-0.5 rounded-md bg-surface-high">
                        {cantProductos} {cantProductos === 1 ? 'producto' : 'productos'}
                      </span>
                      <button
                        onClick={() => iniciarEdicion(rubro)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-high transition-colors"
                        title="Renombrar"
                      >
                        <Edit2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RESET OPERATIVO */}
      <div className="bg-surface border border-warning/30 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-warning/10 shrink-0 mt-0.5">
            <Trash2 size={18} className="text-warning" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-foreground">Borrar datos operativos</h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Elimina movimientos, inventarios, órdenes de compra, facturas, pagos, tareas y elaboraciones.
              <strong className="text-foreground"> Los maestros (productos, depósitos, usuarios, proveedores, recetas) se conservan.</strong>
            </p>
          </div>
        </div>

        {!showConfirmOp ? (
          <button
            onClick={() => setShowConfirmOp(true)}
            disabled={totalOperativos === 0}
            className="w-full px-4 py-2.5 rounded-xl border border-warning/40 text-warning text-sm font-bold hover:bg-warning/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Borrar {totalOperativos.toLocaleString()} registros operativos
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg">
              <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning font-semibold">
                Esta acción no se puede deshacer. Escribí <strong className="font-extrabold">"{CONFIRM_OPERATIVO}"</strong> para confirmar.
              </p>
            </div>
            <input
              type="text"
              value={confirmOp}
              onChange={e => setConfirmOp(e.target.value)}
              placeholder={`Escribí: ${CONFIRM_OPERATIVO}`}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-bold text-foreground placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-warning/50"
            />
            <div className="flex gap-2">
              <button
                onClick={ejecutarResetOperativo}
                disabled={confirmOp !== CONFIRM_OPERATIVO || loadingOp}
                className="flex-1 px-4 py-2.5 rounded-xl bg-warning/20 border border-warning/40 text-warning text-sm font-bold hover:bg-warning/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loadingOp ? 'Borrando...' : 'Confirmar borrado'}
              </button>
              <button
                onClick={() => { setShowConfirmOp(false); setConfirmOp(''); }}
                className="px-4 py-2.5 rounded-xl bg-surface-high text-on-surface-variant text-sm font-semibold hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RESET TOTAL */}
      <div className="bg-surface border border-destructive/30 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-destructive/10 shrink-0 mt-0.5">
            <ShieldAlert size={18} className="text-destructive" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-foreground">Reseteo de fábrica</h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Borra <strong className="text-foreground">absolutamente todo</strong> — productos, depósitos, proveedores, recetas, movimientos, facturas, usuarios y más.
              Deja la app como recién instalada con un único usuario <strong className="text-foreground">Administrador (PIN: 1234)</strong>.
            </p>
          </div>
        </div>

        {!showConfirmTot ? (
          <button
            onClick={() => setShowConfirmTot(true)}
            className="w-full px-4 py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm font-bold hover:bg-destructive/10 transition-colors"
          >
            Reseteo de fábrica — borrar TODO
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg">
              <ShieldAlert size={14} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive font-semibold">
                IRREVERSIBLE. Se borrarán TODOS los datos. Escribí <strong className="font-extrabold">"{CONFIRM_TOTAL}"</strong> para confirmar.
              </p>
            </div>
            <input
              type="text"
              value={confirmTot}
              onChange={e => setConfirmTot(e.target.value)}
              placeholder={`Escribí: ${CONFIRM_TOTAL}`}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-bold text-foreground placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-destructive/50"
            />
            <div className="flex gap-2">
              <button
                onClick={ejecutarResetTotal}
                disabled={confirmTot !== CONFIRM_TOTAL || loadingTot}
                className="flex-1 px-4 py-2.5 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive text-sm font-bold hover:bg-destructive/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loadingTot ? 'Reseteando...' : 'Confirmar reseteo de fábrica'}
              </button>
              <button
                onClick={() => { setShowConfirmTot(false); setConfirmTot(''); }}
                className="px-4 py-2.5 rounded-xl bg-surface-high text-on-surface-variant text-sm font-semibold hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
