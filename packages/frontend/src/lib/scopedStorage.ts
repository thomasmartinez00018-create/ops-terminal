// ============================================================================
// scopedStorage — helpers de localStorage que respetan el tenant (workspace)
// ----------------------------------------------------------------------------
// El sistema es multi-tenant: una cuenta puede entrar a varios workspaces, y
// dentro de cada workspace los IDs de usuario son independientes (cada org
// tiene su propia tabla staff arrancando en 1). Si dos workspaces distintos
// ambos tienen un staff con id=1, y nuestra clave de localStorage fuera solo
// `recent_products_1`, los "productos recientes" se mezclarían entre orgs.
//
// Este helper construye claves del tipo `recent_products_W12_U3` para que
// cada combinación (workspace, usuario) tenga su propio slot.
//
// Leemos el workspace del propio localStorage (SessionContext lo persiste
// bajo `ops_workspace`), así no hay que conectar este helper a React ni
// pasar IDs por props por todos lados.
// ============================================================================

const WORKSPACE_KEY = 'ops_workspace';

/** Devuelve el id del workspace activo, o null si no hay. */
function readWorkspaceId(): number | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Construye una clave de storage con el workspace incluido.
 * Si no hay workspace (usuario aún en stage 1), cae a `${prefix}_U${userId}`
 * para no perder data durante el setup — el setup normalmente no usa estas
 * keys pero es una red de seguridad.
 *
 * Ejemplo:
 *   scopedKey('recent_products', 3) → "recent_products_W12_U3"
 *   scopedKey('onboarding_done', 3) → "onboarding_done_W12_U3"
 */
export function scopedKey(prefix: string, userId: number): string {
  const ws = readWorkspaceId();
  return ws != null
    ? `${prefix}_W${ws}_U${userId}`
    : `${prefix}_U${userId}`;
}

/**
 * Misma idea pero cuando solo necesitás scope por workspace, sin userId.
 * Ej: una cache global de productos por workspace.
 */
export function scopedKeyByWorkspace(prefix: string): string {
  const ws = readWorkspaceId();
  return ws != null ? `${prefix}_W${ws}` : prefix;
}
