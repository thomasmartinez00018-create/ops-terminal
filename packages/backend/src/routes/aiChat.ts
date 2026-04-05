import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

const SYSTEM_PROMPT = `Sos el asistente de OPS Terminal, un sistema de gestión de stock gastronómico argentino.
Tu rol es ayudar al equipo a usar correctamente la aplicación y entender cada sección.
Respondés en español rioplatense, de forma breve, clara y práctica (máximo 3 párrafos cortos).
Nunca inventés funcionalidades que no existen. Si no sabés algo específico del negocio, decilo.
Usá bullet points cuando sea útil para listar pasos.`;

// Gemini model name — centralizado para evitar duplicación
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
