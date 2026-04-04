import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { Bot, X, Send, Loader2, MessageCircle, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

// Contexto específico de cada sección para el asistente
const PAGE_CONTEXT: Record<string, { label: string; context: string; sugerencias: string[] }> = {
  '/': {
    label: 'Dashboard',
    context: 'Panel principal con resumen de stock, movimientos recientes y alertas de stock bajo. Muestra KPIs generales del sistema.',
    sugerencias: ['¿Qué significa el stock bajo?', '¿Cómo interpreto los movimientos recientes?', '¿Qué hago si veo una alerta?'],
  },
  '/movimientos': {
    label: 'Movimientos',
    context: 'Registro de todos los movimientos de stock: ingresos (compras), egresos (ventas/consumo), transferencias entre depósitos, mermas y ajustes. Cada movimiento descuenta o suma stock a un producto en un depósito.',
    sugerencias: ['¿Cómo registro una venta?', '¿Cuál es la diferencia entre merma y consumo interno?', '¿Cómo hago una transferencia entre depósitos?'],
  },
  '/stock': {
    label: 'Stock',
    context: 'Vista del stock actual calculado a partir de todos los movimientos. Muestra cantidad disponible de cada producto por depósito. El stock teórico se calcula sumando ingresos y restando egresos desde el inicio.',
    sugerencias: ['¿Por qué el stock teórico difiere del físico?', '¿Cómo filtro por depósito?', '¿Qué es el stock mínimo?'],
  },
  '/productos': {
    label: 'Productos',
    context: 'Maestro de productos. Cada producto tiene código único, rubro, tipo (crudo/elaborado/semielaborado/insumo), unidad de compra, unidad de uso y factor de conversión. El código de barras permite usar el lector óptico.',
    sugerencias: ['¿Cuál es la diferencia entre unidad de compra y unidad de uso?', '¿Qué es el factor de conversión?', '¿Cómo cargo el código de barras?'],
  },
  '/depositos': {
    label: 'Depósitos',
    context: 'Gestión de depósitos y almacenes donde se guarda el stock (cocina, barra, cámara, freezer, depósito seco, etc.). Cada movimiento debe especificar origen y/o destino.',
    sugerencias: ['¿Cuántos depósitos debo crear?', '¿Cómo asigno un depósito por defecto a un usuario?', '¿Qué pasa si borro un depósito?'],
  },
  '/recetas': {
    label: 'Recetas',
    context: 'Recetas vinculadas a elaboraciones. Cada receta tiene ingredientes con cantidades y merma esperada. Se usa para calcular el costo de preparación y para registrar elaboraciones (producción interna).',
    sugerencias: ['¿Cómo calculo el costo de una receta?', '¿Para qué sirve la merma esperada?', '¿Cómo vinculo una receta a un producto elaborado?'],
  },
  '/proveedores': {
    label: 'Proveedores',
    context: 'Gestión de proveedores. Cada proveedor puede tener productos asignados con su nombre, precio y unidad de venta. Los precios se actualizan automáticamente cuando se confirman facturas escaneadas.',
    sugerencias: ['¿Cómo comparo precios entre proveedores?', '¿Cómo asocio un producto a un proveedor?', '¿Dónde veo el historial de precios?'],
  },
  '/inventarios': {
    label: 'Inventarios',
    context: 'Conteo físico del stock. Se crea un inventario por depósito, se cargan las cantidades reales contadas, y al cerrar el sistema compara con el stock teórico para detectar diferencias (discrepancias). Podés usar el lector de código de barras para contar más rápido.',
    sugerencias: ['¿Cómo inicio un conteo físico?', '¿Puedo usar el lector de barras en el inventario?', '¿Qué pasa cuando cierro el inventario?'],
  },
  '/ordenes-compra': {
    label: 'Órdenes de Compra',
    context: 'Gestión de pedidos a proveedores. Se crea la OC con los productos y cantidades, se envía al proveedor, y al recibir la mercadería se "recibe" la OC registrando cantidades reales y precios. Eso genera automáticamente los movimientos de ingreso.',
    sugerencias: ['¿Cómo creo una orden de compra?', '¿Qué hago cuando llega la mercadería?', '¿Puedo recibir parcialmente una OC?'],
  },
  '/elaboraciones': {
    label: 'Elaboraciones',
    context: 'Registro de producción interna (ej: NALGA que entra y sale como MILANESA). Se registra qué producto se produce, cuánto, y qué insumos se consumieron. Eso descuenta los insumos del stock y suma el producto elaborado.',
    sugerencias: ['¿Cuál es la diferencia entre lo que entra y lo que sale?', '¿Necesito una receta para elaborar?', '¿Cómo registro que de 5kg de carne salen 4kg de milanesas?'],
  },
  '/control-scanner': {
    label: 'Control Scanner',
    context: 'Herramienta para usar con lector de código de barras. Permite hacer movimientos rápidos escaneando el producto. Ideal para puestos de trabajo con lector óptico conectado al equipo.',
    sugerencias: ['¿Cómo uso el lector de códigos de barras?', '¿Qué hago si el producto no tiene código de barras?', '¿Puedo registrar ingresos con el scanner?'],
  },
  '/escanear-factura': {
    label: 'Escanear Factura',
    context: 'Escaneá una factura con la cámara o subí una foto y la IA extrae automáticamente los productos, cantidades y precios. Detecta si es Factura A, B, C, Ticket o Remito, y calcula el IVA. Al confirmar, registra los ingresos de stock y guarda la factura en contabilidad.',
    sugerencias: ['¿Qué tipos de facturas reconoce la IA?', '¿Qué hago si la IA no reconoce un producto?', '¿La factura queda guardada después de confirmar?'],
  },
  '/facturas': {
    label: 'Facturas',
    context: 'Historial de facturas recibidas de proveedores. Muestra estado de pago (pendiente/parcial/pagada/anulada), saldo adeudado y permite registrar pagos. Se pueden filtrar por proveedor, estado y tipo de comprobante.',
    sugerencias: ['¿Cómo registro un pago de factura?', '¿Qué significa estado "parcial"?', '¿Cómo anulo una factura?'],
  },
  '/cuentas-por-pagar': {
    label: 'Cuentas por Pagar',
    context: 'Dashboard de deudas con proveedores. Muestra el total adeudado agrupado por proveedor con columnas de aging (antigüedad): corriente (0-30 días), 31-60, 61-90 y vencidas (90+ días). Rojo = urgente.',
    sugerencias: ['¿Qué significa el aging o antigüedad?', '¿Cómo veo las facturas de un proveedor en particular?', '¿Cuándo se marca en rojo una deuda?'],
  },
  '/reportes-costos': {
    label: 'Costos y Precios',
    context: 'Dos reportes: COGS (Costo de Mercadería Vendida) por período y rubro, y Historial de Precios por producto. El COGS muestra cuánto se gastó en cada rubro de insumos. El historial de precios muestra la evolución de precio de un producto en el tiempo.',
    sugerencias: ['¿Qué es el COGS?', '¿Cómo veo si subió el precio de un insumo?', '¿Puedo ver el costo por rubro del mes pasado?'],
  },
  '/discrepancias': {
    label: 'Discrepancias',
    context: 'Diferencias entre el stock teórico (calculado por movimientos) y el físico (contado en inventarios). Permite identificar pérdidas, errores de registro o robos. Se generan automáticamente al cerrar un inventario.',
    sugerencias: ['¿Cómo se genera una discrepancia?', '¿Qué hago con una discrepancia grande?', '¿Puedo corregir el stock teórico?'],
  },
  '/reportes': {
    label: 'Reportes',
    context: 'Reportes generales: movimientos por tipo, mermas por período, stock valorizado y análisis por producto. Permiten exportar datos para análisis externos.',
    sugerencias: ['¿Cómo veo las mermas del mes?', '¿Qué es el stock valorizado?', '¿Puedo exportar los reportes a Excel?'],
  },
  '/usuarios': {
    label: 'Usuarios',
    context: 'Gestión de usuarios del sistema. Cada usuario tiene rol (admin/cocina/depósito/barra/compras), PIN de acceso y permisos individuales por sección. El admin tiene acceso total. Los permisos limitan qué secciones ve cada usuario en el menú.',
    sugerencias: ['¿Cuál es la diferencia entre roles y permisos?', '¿Cómo cambio el PIN de un usuario?', '¿Qué puede hacer un usuario de "cocina"?'],
  },
  '/configuracion': {
    label: 'Configuración',
    context: 'Herramientas de administración del sistema. Permite resetear datos operativos (movimientos, facturas, OC) manteniendo los maestros, o hacer un reseteo de fábrica total que borra absolutamente todo. Solo visible para administradores.',
    sugerencias: ['¿Qué diferencia hay entre borrar datos operativos y reseteo total?', '¿Puedo recuperar los datos después del reseteo?', '¿Qué queda después del reseteo de fábrica?'],
  },
  '/importar': {
    label: 'Importar',
    context: 'Importación masiva de datos desde archivos CSV o formato Maxirest. Permite cargar productos, depósitos, proveedores y movimientos históricos de forma masiva.',
    sugerencias: ['¿Qué formato debe tener el CSV?', '¿Puedo importar desde Maxirest?', '¿Se sobreescriben los datos existentes al importar?'],
  },
  '/tareas': {
    label: 'Tareas',
    context: 'Sistema de asignación de tareas al equipo. Permite crear tareas con tipo (recibir mercadería, inventario, limpieza, etc.), prioridad, fecha y asignado a una persona. Las tareas quedan pendientes hasta que el usuario asignado las completa.',
    sugerencias: ['¿Cómo asigno una tarea a alguien?', '¿Cómo ve el equipo sus tareas pendientes?', '¿Para qué sirven las prioridades?'],
  },
};

const DEFAULT_CONTEXT = {
  label: 'OPS Terminal',
  context: 'Sistema de gestión de stock gastronómico argentino.',
  sugerencias: ['¿Cómo empiezo a usar el sistema?', '¿Qué secciones tiene la app?', '¿Cómo registro el stock inicial?'],
};

export default function AIAssistant() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageInfo = PAGE_CONTEXT[location.pathname] || DEFAULT_CONTEXT;

  // Reset chat when page changes
  useEffect(() => {
    setMessages([]);
  }, [location.pathname]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 100);
    }
  }, [open, messages]);

  const enviar = async (texto?: string) => {
    const msg = (texto || input).trim();
    if (!msg || loading) return;
    setInput('');

    const newMsg: Message = { role: 'user', text: msg };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // Solo enviamos contexto de página en el primer mensaje
      const isFirst = messages.length === 0;
      const data = await api.aiChat({
        message: msg,
        pageContext: isFirst ? `${pageInfo.label}: ${pageInfo.context}` : undefined,
        historial: updatedMessages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          text: m.text,
        })),
      });
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Hubo un error al procesar tu pregunta. Verificá que la clave de Gemini esté configurada.' }]);
    }
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  // Format text: convert **bold** and bullet points
  const formatText = (text: string) => {
    return text
      .split('\n')
      .map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          const content = trimmed.replace(/^[-•]\s/, '');
          return (
            <li key={i} className="flex gap-1.5 text-xs leading-relaxed">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            </li>
          );
        }
        return (
          <p key={i} className="text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
          />
        );
      })
      .filter(Boolean);
  };

  return (
    <>
      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '480px' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-high shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/15">
                  <Sparkles size={14} className="text-primary" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-foreground">Asistente IA</p>
                  <p className="text-[10px] text-on-surface-variant font-medium">{pageInfo.label}</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-foreground hover:bg-surface transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={12} className="text-primary" />
                    </div>
                    <div className="bg-surface-high rounded-xl rounded-tl-none px-3 py-2 flex-1">
                      <p className="text-xs text-foreground font-medium">
                        Hola, soy tu asistente. Estás en <strong>{pageInfo.label}</strong>.
                        ¿En qué te puedo ayudar?
                      </p>
                    </div>
                  </div>
                  {/* Sugerencias */}
                  <div className="space-y-1.5 pl-8">
                    {pageInfo.sugerencias.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => enviar(s)}
                        className="w-full text-left text-[11px] font-medium text-primary bg-primary/8 hover:bg-primary/15 border border-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={12} className="text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-xl px-3 py-2 max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-primary text-on-primary rounded-tr-none'
                        : 'bg-surface-high text-foreground rounded-tl-none'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-xs">{msg.text}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {formatText(msg.text)}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Bot size={12} className="text-primary" />
                  </div>
                  <div className="bg-surface-high rounded-xl rounded-tl-none px-3 py-2">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border shrink-0">
              <div className="flex gap-2 items-center bg-surface-high rounded-xl px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Preguntame algo..."
                  disabled={loading}
                  className="flex-1 bg-transparent text-xs font-semibold text-foreground placeholder:text-on-surface-variant/60 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => enviar()}
                  disabled={!input.trim() || loading}
                  className="p-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-[10px] text-on-surface-variant/60 hover:text-on-surface-variant mt-1.5 ml-1 transition-colors"
                >
                  Limpiar conversación
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-surface border border-border text-on-surface-variant'
            : 'bg-primary text-on-primary hover:scale-105'
        }`}
        title="Asistente IA"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </>
  );
}
