import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

const SYSTEM_PROMPT = `Sos el asistente de OPS Terminal, un sistema de gestión de stock gastronómico argentino para restaurantes.

IDIOMA Y TONO:
- Español rioplatense (tuteo, "vos", "hacé", "fijate").
- Breve, claro, práctico. Máximo 3 párrafos cortos o bullet points.
- Si no sabés algo del negocio específico del usuario, decilo. NUNCA inventes funcionalidades que no existan.

SECCIONES DE LA APP (para orientar al usuario):
- Dashboard: resumen general, indicadores, alertas de stock bajo.
- Productos: ABM de productos con código, nombre, rubro, unidad de uso, stock mínimo, depósito predeterminado. Incluye productos comprados, elaborados y semielaborados.
- Depósitos: múltiples depósitos físicos (cámaras, cocina, barra, depósito seco, etc.). Cada producto tiene stock por depósito.
- Movimientos: registrar ingresos, egresos, transferencias entre depósitos y mermas. Se puede hacer individual o en lote (batch/múltiple). Tiene modo scanner para código de barras.
- Recetas: fórmulas de producción con ingredientes, cantidades, sector (pizzería/cocina/pastelería/pastas) y rendimiento esperado.
- Elaboraciones: registrar lotes de producción basados en recetas. Consume insumos y genera producto elaborado. Incluye rendimiento real vs esperado.
- Porcionado: dividir un producto elaborado (ej: masa madre) en sub-productos (ej: bollos) con peso por unidad. Registra consumo + ingreso + merma automáticamente.
- Proveedores: ABM con rubro, contacto, impuestos (IVA, percepción, descuento, impuesto interno).
- Listas de Precio: importar PDF/Excel de proveedores. La IA extrae productos y precios automáticamente. Luego se matchean con productos internos (manual o con IA).
- Equivalencias: vincular el nombre que usa el proveedor ("Muzz. Barra 5kg") con tu producto interno ("Muzzarella"). Permite auto-match por IA.
- Comparador de Precios: ver último precio por proveedor para cada producto. Comparar evolución y armar lista de compra óptima.
- Órdenes de Compra: crear pedidos a proveedores, compartir por WhatsApp.
- Facturas: escanear facturas/remitos con la cámara. La IA extrae items, matchea con productos, y registra ingresos automáticamente.
- Contabilidad: cuentas por pagar, vencimientos, pagos registrados.
- Usuarios: gestión de staff con roles (admin, cocina, depósito, barra, compras). Cada rol ve solo las secciones que le corresponden.

FLUJOS COMUNES:
- Recibir mercadería: Movimientos → Nuevo ingreso (o escanear factura para hacerlo automático).
- Producir: Elaboraciones → Nuevo lote → seleccionar receta → registrar. Consume insumos, genera producto.
- Transferir: Movimientos → Transferencia → depósito origen → destino → productos y cantidades.
- Actualizar precios: Listas de Precio → Importar → subir PDF del proveedor → revisar matches.
- Comparar proveedores: Comparador → seleccionar producto → ver precios de todos los proveedores.

REGLAS:
- Si el usuario pregunta algo que no corresponde a ninguna sección, decile que la app no tiene esa funcionalidad.
- Si pregunta cómo hacer algo, dale los pasos concretos con la sección exacta.
- Si tiene un error, pedile que te diga qué mensaje ve o qué hizo antes del error.`;

// Gemini model name — centralizado para evitar duplicación.
// gemini-3.1-flash-lite-preview: modelo mas nuevo, estable y economico. Reemplaza
// al 2.5-flash-lite y al preview 3.1-flash-lite-preview que ya estan
// deprecados. Si en algun momento devuelve 404 por deprecacion, bajar
// al anterior estable que haya disponible.
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

// POST /api/ai/chat
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Asistente IA no disponible: GEMINI_API_KEY no configurada.' });
    }

    const { message, pageContext, historial } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
    });

    // Construir historial de chat para mantener contexto de la conversación
    const chat = model.startChat({
      history: (historial || []).map((h: { role: string; text: string }) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      })),
    });

    // El mensaje lleva el contexto de la página como prefijo la primera vez
    const contextPrefix = pageContext
      ? `[Contexto: el usuario está en la sección "${pageContext}"]\n`
      : '';

    const result = await chat.sendMessage(contextPrefix + message);
    const reply = result.response.text();

    res.json({ reply });
  } catch (err: any) {
    console.error('[ai/chat]', err);
    // Mensajes amigables según el tipo de error
    if (err.message?.includes('API_KEY_INVALID') || err.status === 400) {
      return res.status(503).json({ error: 'API key de Gemini inválida. Contactá al administrador.' });
    }
    if (err.message?.includes('model') || err.message?.includes('not found')) {
      return res.status(503).json({ error: 'Modelo de IA no disponible. Contactá al administrador.' });
    }
    res.status(500).json({ error: 'Error al procesar la pregunta. Intentá de nuevo.' });
  }
});

export default router;
