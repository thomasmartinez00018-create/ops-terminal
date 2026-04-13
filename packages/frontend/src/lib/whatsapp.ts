/** Normalize Argentine WhatsApp number and build wa.me link */
export function buildWALink(whatsapp: string | null | undefined, message: string): string | null {
  if (!whatsapp) return null;
  let num = String(whatsapp).replace(/\D/g, '');
  if (num.startsWith('0')) num = num.slice(1);
  if (num.startsWith('549')) { /* ok */ }
  else if (num.startsWith('54')) num = '549' + num.slice(2);
  else num = '549' + num;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

/** Build order message for WhatsApp */
export function buildOrderMessage(opts: {
  restaurante?: string;
  proveedor?: string;
  fecha?: string;
  items: { producto: string; cantidad?: number; unidad?: string }[];
  total?: number;
}): string {
  const d = opts.fecha
    ? new Date(opts.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

  let msg = `*Pedido${opts.restaurante ? ` - ${opts.restaurante}` : ''}*\n`;
  msg += `${d}\n`;
  if (opts.proveedor) msg += `Proveedor: ${opts.proveedor}\n`;
  msg += '\n';
  opts.items.forEach(it => {
    const cant = it.cantidad ?? 1;
    msg += `- ${it.producto} x ${cant}${it.unidad ? ' ' + it.unidad : ''}\n`;
  });
  if (opts.total && opts.total > 0) {
    msg += `\nTotal estimado: $${opts.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}\n`;
  }
  return msg;
}
