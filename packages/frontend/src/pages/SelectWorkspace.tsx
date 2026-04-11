import { useState } from 'react';
import { useSession } from '../context/SessionContext';
import Button from '../components/ui/Button';

// ============================================================================
// SelectWorkspace — pantalla stage 1 → stage 2
// ============================================================================
// Después de login/signup, si la cuenta tiene más de un workspace (ej. el
// papá de Tomás con dos restos) mostramos este selector tipo "profile
// picker" de Netflix/Slack.
//
// Si solo hay un workspace, el SessionContext ya llama switchWorkspace()
// automáticamente y este componente nunca se muestra.
// ============================================================================
export default function SelectWorkspace() {
  const { workspaces, selectWorkspace, createWorkspace, cuenta, logout } = useSession();
  const [busy, setBusy] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setBusy(-1);
    try {
      const ws = await createWorkspace(newName.trim());
      await selectWorkspace(ws.id);
    } catch (err: any) {
      setError(err?.message || 'Error al crear workspace');
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-lg font-extrabold tracking-tight text-foreground">
            OPS<span className="text-primary">TERMINAL</span>
          </div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em] mt-1">
            Elegí un workspace
          </p>
          {cuenta && (
            <p className="text-xs text-on-surface-variant mt-3 font-semibold">
              {cuenta.nombre} · <span className="text-on-surface-variant/70">{cuenta.email}</span>
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive text-center font-semibold mb-3">{error}</p>
        )}

        {!creating ? (
          <>
            <div className="space-y-2 mb-4">
              {workspaces.map(w => (
                <button
                  key={w.id}
                  disabled={busy !== null}
                  onClick={() => handleSelect(w.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-surface-high transition-all text-left disabled:opacity-50"
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
              onClick={() => setCreating(true)}
            >
              + Nuevo workspace
            </Button>
          </>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Nombre del workspace
              </label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                placeholder="Ej: Restaurante Sucursal Norte"
                autoFocus
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => { setCreating(false); setNewName(''); }}
                disabled={busy !== null}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={busy !== null || !newName.trim()}>
                {busy === -1 ? 'Creando...' : 'Crear'}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-border text-center">
          <button
            onClick={logout}
            className="text-xs font-bold text-on-surface-variant hover:text-destructive uppercase tracking-widest"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
