import { Router, Request, Response } from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';

const router = Router();
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// POST /api/importar/csv - Import CSV data
router.post('/csv', async (req: Request, res: Response) => {
  try {
    const { tipo, datos, mapeo } = req.body;
    // tipo: 'productos' | 'proveedores' | 'movimientos' | 'ventas'
    // datos: array of row objects (parsed on frontend)
    // mapeo: { columnaOrigen: campoDestino } mapping

    if (!tipo || !datos || !Array.isArray(datos) || datos.length === 0) {
      res.status(400).json({ error: 'Datos inválidos. Se requiere tipo y datos[]' });
      return;
    }

    const resultados = { insertados: 0, actualizados: 0, errores: [] as string[] };

    if (tipo === 'productos') {
      for (const row of datos) {
        try {
          const data: any = {};
          if (mapeo) {
            for (const [origen, destino] of Object.entries(mapeo)) {
              if (row[origen] !== undefined && row[origen] !== '') {
                data[destino as string] = row[origen];
              }
            }
          } else {
            Object.assign(data, row);
          }

          // Normalizar snake_case → camelCase para campos del schema Prisma
          if (data.unidad_compra && !data.unidadCompra) { data.unidadCompra = data.unidad_compra; }
          if (data.unidad_uso   && !data.unidadUso)    { data.unidadUso   = data.unidad_uso;    }
          if (data.stock_minimo && !data.stockMinimo)   { data.stockMinimo = data.stock_minimo;  }
          if (data.stock_ideal  && !data.stockIdeal)    { data.stockIdeal  = data.stock_ideal;   }

          // Eliminar campos desconocidos por Prisma
          delete data.unidad_compra;
          delete data.unidad_uso;
          delete data.stock_minimo;
          delete data.stock_ideal;
          delete data.precio;        // campo informativo, no existe en el schema

          // Ensure required fields
          if (!data.codigo || !data.nombre) {
            resultados.errores.push(`Fila sin código o nombre: ${JSON.stringify(row).slice(0, 100)}`);
            continue;
          }

          // Set defaults
          data.rubro = data.rubro || 'Otros';
          data.tipo  = data.tipo  || 'insumo';
          data.unidadCompra = data.unidadCompra || 'kg';
          data.unidadUso    = data.unidadUso    || data.unidadCompra || 'kg';
          if (data.factorConversion) data.factorConversion = parseFloat(data.factorConversion);
          if (data.stockMinimo)      data.stockMinimo      = parseFloat(data.stockMinimo);
          if (data.stockIdeal)       data.stockIdeal       = parseFloat(data.stockIdeal);

          // Campos permitidos por el schema — descartar cualquier otro
          const allowed = ['codigo','nombre','rubro','tipo','unidadCompra','unidadUso',
            'factorConversion','codigoBarras','depositoDefectoId','stockMinimo','stockIdeal','activo'];
          const clean: any = {};
          for (const k of allowed) { if (data[k] !== undefined) clean[k] = data[k]; }

          const existing = await prisma.producto.findFirst({ where: { codigo: clean.codigo } });
          if (existing) {
            const { codigo: _, ...updateData } = clean;
            await prisma.producto.update({ where: { id: existing.id }, data: updateData });
            resultados.actualizados++;
          } else {
            await prisma.producto.create({ data: clean });
            resultados.insertados++;
          }
        } catch (e: any) {
          resultados.errores.push(`Error en fila: ${e.message?.slice(0, 100)}`);
        }
      }
    } else if (tipo === 'proveedores') {
      // Trim agresivo de strings + descarte de filas chatarra.
      // Maxirest exporta con padding de espacios brutal (ej: "DANTA                  ").
      // Limpiamos todo string, descartamos vacíos, y solo guardamos los
      // campos que el schema Proveedor reconoce.
      const cleanStr = (v: any): string | null => {
        if (v === null || v === undefined) return null;
        const s = String(v).replace(/\s+/g, ' ').trim();
        return s.length ? s : null;
      };
      // Mapeo flexible de columnas Maxirest → schema. Aceptamos varias
      // variantes (uppercase, con/sin acento, sufijos).
      const grabFrom = (row: any, keys: string[]): string | null => {
        for (const k of keys) {
          // exact (case-insensitive)
          const found = Object.keys(row).find(rk => rk.toUpperCase().trim() === k.toUpperCase());
          if (found) {
            const v = cleanStr(row[found]);
            if (v) return v;
          }
        }
        return null;
      };

      const allowed = ['codigo', 'nombre', 'contacto', 'telefono', 'email', 'rubro', 'whatsapp'];

      for (const row of datos) {
        try {
          let data: any;
          if (mapeo && Object.keys(mapeo).length > 0) {
            // El usuario mapeó manualmente
            data = Object.fromEntries(
              Object.entries(mapeo)
                .map(([o, d]) => [d, cleanStr(row[o])])
                .filter(([, v]) => v !== null)
            );
          } else {
            // Auto-mapping desde columnas Maxirest típicas
            data = {
              codigo: grabFrom(row, ['CODIGO', 'COD', 'CODIGO_PROV']),
              nombre: grabFrom(row, ['NOMBRE', 'RAZON', 'RAZON_SOCIAL', 'DESCRIPCION']),
              contacto: grabFrom(row, ['CONTACTO', 'PERSONA', 'RESPONSABLE']),
              telefono: grabFrom(row, ['TELEFONO', 'TEL', 'FIJO']),
              whatsapp: grabFrom(row, ['CELULAR', 'WHATSAPP', 'CELU', 'MOVIL']),
              email: grabFrom(row, ['EMAIL', 'MAIL', 'CORREO']),
              rubro: grabFrom(row, ['RUBRO', 'CATEGORIA', 'SECTOR']),
            };
          }

          // Sanitizar — solo campos permitidos y no nulos
          const clean: any = {};
          for (const k of allowed) {
            if (data[k] !== null && data[k] !== undefined && data[k] !== '') {
              clean[k] = typeof data[k] === 'string' ? data[k] : String(data[k]);
            }
          }

          if (!clean.codigo || !clean.nombre) {
            // Solo loguear si la fila tiene algo de info (no si está totalmente vacía)
            const tieneAlgo = Object.values(row).some((v: any) => cleanStr(v));
            if (tieneAlgo) {
              resultados.errores.push(`Proveedor sin código o nombre: ${(clean.nombre || clean.codigo || JSON.stringify(row).slice(0, 60))}`);
            }
            continue;
          }

          const existing = await prisma.proveedor.findFirst({ where: { codigo: clean.codigo } });
          if (existing) {
            await prisma.proveedor.update({ where: { id: existing.id }, data: clean });
            resultados.actualizados++;
          } else {
            await prisma.proveedor.create({ data: clean });
            resultados.insertados++;
          }
        } catch (e: any) {
          resultados.errores.push(`Error: ${e.message?.slice(0, 100)}`);
        }
      }
    } else if (tipo === 'recetas') {
      // Importar carta/menú de Maxirest u otro POS — crea esqueletos de Receta.
      // Cada fila debería tener: codigo (del plato en el POS), nombre (descripción),
      // precioVenta (precio en carta), categoria (entrada/plato/postre/bebida),
      // sector (cocina/pizzeria/etc), porciones (default 1).
      // El chef completa los ingredientes después en la página Recetas.
      // Si la receta ya existe (mismo código), actualiza nombre/precio/categoría
      // pero NO toca los ingredientes ni el productoResultadoId (no destructivo).
      for (const row of datos) {
        try {
          const data: any = mapeo
            ? Object.fromEntries(
                Object.entries(mapeo)
                  .map(([o, d]) => [d, row[o]])
                  .filter(([, v]) => v !== undefined && v !== '')
              )
            : { ...row };

          if (!data.nombre) {
            resultados.errores.push(`Plato sin nombre: ${JSON.stringify(row).slice(0, 80)}`);
            continue;
          }

          // Normalizar categoría a valores aceptados
          const catRaw = String(data.categoria || '').toLowerCase().trim();
          let categoria: string | null = null;
          if (/entrada|aperitiv/i.test(catRaw)) categoria = 'entrada';
          else if (/postre|dulce/i.test(catRaw)) categoria = 'postre';
          else if (/bebid|trago|vino|cerveza|gaseo/i.test(catRaw)) categoria = 'bebida';
          else if (/guarn|acomp/i.test(catRaw)) categoria = 'guarnicion';
          else if (catRaw) categoria = 'plato';

          const sectorRaw = String(data.sector || '').toLowerCase().trim();
          let sector: string | null = null;
          if (/pizza/i.test(sectorRaw)) sector = 'pizzeria';
          else if (/cocina/i.test(sectorRaw)) sector = 'cocina';
          else if (/pastel|reposter|postre/i.test(sectorRaw)) sector = 'pasteleria';
          else if (/pasta/i.test(sectorRaw)) sector = 'pastas';

          const codigo = String(data.codigo || '').trim() || null;
          const precioVenta = data.precioVenta ? parseFloat(String(data.precioVenta).replace(',', '.')) : null;
          const porciones = data.porciones ? Math.max(1, parseInt(String(data.porciones))) : 1;
          const margenObjetivo = data.margenObjetivo ? parseFloat(String(data.margenObjetivo)) : 70;

          const recetaData: any = {
            nombre: String(data.nombre).trim(),
            codigo,
            categoria,
            sector,
            precioVenta,
            porciones,
            margenObjetivo,
            // Marca como salida a carta — son platos del menú importados.
            salidaACarta: true,
          };

          // Buscar existente por código (si tiene) o por nombre exacto
          const existing = codigo
            ? await prisma.receta.findFirst({ where: { codigo } })
            : await prisma.receta.findFirst({ where: { nombre: recetaData.nombre } });

          if (existing) {
            // Actualización no destructiva: solo nombre/categoría/sector/precio.
            // No tocamos ingredientes ni productoResultadoId.
            await prisma.receta.update({
              where: { id: existing.id },
              data: {
                nombre: recetaData.nombre,
                categoria: recetaData.categoria ?? existing.categoria,
                sector: recetaData.sector ?? existing.sector,
                precioVenta: recetaData.precioVenta ?? existing.precioVenta,
                margenObjetivo: recetaData.margenObjetivo ?? existing.margenObjetivo,
                salidaACarta: true,
              },
            });
            resultados.actualizados++;
          } else {
            await prisma.receta.create({ data: recetaData });
            resultados.insertados++;
          }
        } catch (e: any) {
          resultados.errores.push(`Error en fila: ${e.message?.slice(0, 100)}`);
        }
      }
    } else if (tipo === 'ventas') {
      // Import sales data from Maxirest - creates consumo_interno movements
      // Expected: array of { recetaCodigo, cantidad, fecha?, depositoOrigenId? }
      for (const row of datos) {
        try {
          const data: any = mapeo
            ? Object.fromEntries(Object.entries(mapeo).map(([o, d]) => [d, row[o]]).filter(([, v]) => v !== undefined && v !== ''))
            : { ...row };

          const receta = data.recetaCodigo
            ? await prisma.receta.findFirst({
                where: { codigo: data.recetaCodigo },
                include: { ingredientes: true }
              })
            : null;

          if (!receta) {
            resultados.errores.push(`Receta no encontrada: ${data.recetaCodigo}`);
            continue;
          }

          const cantidadVendida = parseFloat(data.cantidad) || 1;
          const fecha = data.fecha || new Date().toISOString().split('T')[0];
          const hora = data.hora || new Date().toTimeString().slice(0, 5);

          // Create a movement for each ingredient in the recipe
          for (const ing of receta.ingredientes) {
            // Factor de desperdicio estándar gastronómico: 1 / (1 - merma/100)
            const mermaSafe = Math.min(Math.max(Number(ing.mermaEsperada) || 0, 0), 99);
            const factor = mermaSafe > 0 ? 1 / (1 - mermaSafe / 100) : 1;
            await prisma.movimiento.create({
              data: {
                tipo: 'consumo_interno',
                productoId: ing.productoId,
                cantidad: ing.cantidad * cantidadVendida * factor,
                unidad: ing.unidad,
                fecha,
                hora,
                usuarioId: data.usuarioId || 1,
                depositoOrigenId: data.depositoOrigenId ? parseInt(data.depositoOrigenId) : null,
                observacion: `Venta Maxirest: ${receta.nombre} x${cantidadVendida}`,
              }
            });
          }
          resultados.insertados += receta.ingredientes.length;
        } catch (e: any) {
          resultados.errores.push(`Error: ${e.message?.slice(0, 100)}`);
        }
      }
    } else if (tipo === 'recetas-maxirest') {
      // ════════════════════════════════════════════════════════════════════
      // RECETAS MAXIREST — formato real con ESCANDALLO completo.
      // Maxirest exporta 1 fila POR INGREDIENTE de cada plato. Columnas
      // típicas (toleramos variantes/cortes en el nombre):
      //   COD_ART / CODIGO  → código del plato
      //   ARTICULO          → nombre del plato
      //   PORCIONES         → porciones del plato
      //   RUBROART          → rubro del plato (→ categoría)
      //   COD_INS           → código del insumo
      //   INSUMO            → nombre del insumo
      //   RUBROINS          → rubro del insumo
      //   CANTIDAD          → cantidad del insumo en la receta
      //   UNIDAD_MET        → unidad (KILO, LITRO, UNIDAD…)
      //   PUNIT             → precio unitario del insumo (costo de referencia)
      //   MARG              → margen objetivo (%)
      //
      // Acciones:
      //   - Agrupa por código de plato
      //   - Crea/actualiza la Receta (cabecera) — salidaACarta=true
      //   - Por cada insumo: lo busca como Producto (por código o nombre);
      //     si no existe lo CREA (rubro, unidad, precioReferencia)
      //   - Crea los RecetaIngrediente. Si la receta ya tenía ingredientes,
      //     los REEMPLAZA (re-import idempotente). El productoResultadoId y
      //     el precioVenta NO se tocan si ya existían.
      // ════════════════════════════════════════════════════════════════════
      const col = (row: any, ...cands: string[]): string => {
        // Busca el primer header que matchee (normalizado: sin espacios,
        // sin acentos, uppercase, ignora sufijos cortados).
        const norm = (s: string) =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')            .toUpperCase().replace(/[^A-Z0-9]/g, '');
        const keys = Object.keys(row);
        for (const cand of cands) {
          const c = norm(cand);
          const hit = keys.find(k => {
            const nk = norm(k);
            return nk === c || nk.startsWith(c) || c.startsWith(nk);
          });
          if (hit && row[hit] !== undefined && row[hit] !== '') {
            return String(row[hit]).trim();
          }
        }
        return '';
      };
      const num = (v: string) => {
        const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
      };
      // num que respeta el punto decimal real (cantidades tipo 0,05)
      const numDec = (v: string) => {
        const n = parseFloat(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
      };

      // 1. Agrupar por código de plato
      const grupos = new Map<string, any[]>();
      for (const row of datos) {
        const codPlato = col(row, 'COD_ART', 'CODIGO', 'CODART', 'CODARTICULO');
        if (!codPlato) continue;
        if (!grupos.has(codPlato)) grupos.set(codPlato, []);
        grupos.get(codPlato)!.push(row);
      }

      for (const [codPlato, filas] of grupos) {
        try {
          const primera = filas[0];
          const nombrePlato = col(primera, 'ARTICULO', 'NOMBRE', 'DESCRIPCION', 'PLATO');
          if (!nombrePlato) {
            resultados.errores.push(`Plato ${codPlato} sin nombre — salteado`);
            continue;
          }
          const porciones = Math.max(1, parseInt(col(primera, 'PORCIONES', 'PORC')) || 1);
          const margRaw = col(primera, 'MARG', 'MARGEN');
          const margenObjetivo = margRaw ? numDec(margRaw) : 70;

          const rubroArt = col(primera, 'RUBROART', 'RUBRO', 'NOMRUB').toLowerCase();
          let categoria: string | null = null;
          if (/entrada|aperitiv/.test(rubroArt)) categoria = 'entrada';
          else if (/postre|dulce/.test(rubroArt)) categoria = 'postre';
          else if (/bebid|trago|vino|cerveza|gaseo|copa/.test(rubroArt)) categoria = 'bebida';
          else if (/guarn|acomp/.test(rubroArt)) categoria = 'guarnicion';
          else if (rubroArt) categoria = 'plato';

          // Cabecera de receta (crear o actualizar no destructivo)
          let receta = await prisma.receta.findFirst({ where: { codigo: codPlato } });
          if (!receta) {
            receta = await prisma.receta.findFirst({ where: { nombre: nombrePlato } });
          }
          if (receta) {
            receta = await prisma.receta.update({
              where: { id: receta.id },
              data: {
                nombre: nombrePlato,
                codigo: codPlato,
                porciones,
                categoria: categoria ?? receta.categoria,
                margenObjetivo: margenObjetivo || receta.margenObjetivo,
                salidaACarta: true,
              },
            });
            resultados.actualizados++;
          } else {
            receta = await prisma.receta.create({
              data: {
                nombre: nombrePlato,
                codigo: codPlato,
                porciones,
                categoria,
                margenObjetivo,
                salidaACarta: true,
              },
            });
            resultados.insertados++;
          }

          // Re-import idempotente: limpiar ingredientes previos de ESTA receta
          await prisma.recetaIngrediente.deleteMany({ where: { recetaId: receta.id } });

          // Ingredientes
          for (const f of filas) {
            const codIns = col(f, 'COD_INS', 'CODINS', 'CODINSUMO');
            const nombreIns = col(f, 'INSUMO', 'NOMINS', 'NOMBREINSUMO');
            if (!nombreIns && !codIns) continue;
            const cantidad = numDec(col(f, 'CANTIDAD', 'CANT'));
            if (cantidad <= 0) continue;
            const unidadRaw = col(f, 'UNIDAD_MET', 'UNIDAD', 'UNIDADMET', 'UM') || 'unidad';
            const unidad = unidadRaw.toLowerCase()
              .replace(/^kilos?$/, 'kg').replace(/^litros?$/, 'lt')
              .replace(/^unidades?$/, 'unidad').replace(/^gramos?$/, 'gr');
            const punit = numDec(col(f, 'PUNIT', 'PRECIOUNIT', 'PUNITARIO'));
            const rubroIns = col(f, 'RUBROINS', 'RUBROINSUMO') || 'Otros';

            // Buscar producto por código o nombre; crear si no existe
            let prod = codIns
              ? await prisma.producto.findFirst({ where: { codigo: codIns } })
              : null;
            if (!prod && nombreIns) {
              prod = await prisma.producto.findFirst({ where: { nombre: nombreIns } });
            }
            if (!prod) {
              prod = await prisma.producto.create({
                data: {
                  codigo: codIns || `MX-INS-${Date.now()}-${Math.floor(Math.random() * 999)}`,
                  nombre: nombreIns || `Insumo ${codIns}`,
                  rubro: rubroIns.slice(0, 40),
                  tipo: 'insumo',
                  unidadCompra: unidad,
                  unidadUso: unidad,
                  factorConversion: 1,
                  precioReferencia: punit > 0 ? punit : null,
                },
              });
            } else if (punit > 0 && (prod.precioReferencia == null || prod.precioReferencia === 0)) {
              // Backfill suave del precio de referencia si estaba vacío
              await prisma.producto.update({
                where: { id: prod.id },
                data: { precioReferencia: punit },
              });
            }

            await prisma.recetaIngrediente.create({
              data: {
                recetaId: receta.id,
                productoId: prod.id,
                cantidad,
                unidad,
              },
            });
          }
        } catch (e: any) {
          resultados.errores.push(`Plato ${codPlato}: ${e.message?.slice(0, 120)}`);
        }
      }
    } else if (tipo === 'ventas-maxirest') {
      // ════════════════════════════════════════════════════════════════════
      // VENTAS MAXIREST — resumen acumulado (sin fecha por transacción).
      // Columnas: CODIGO / NOMBRE / UNIDADES / PRECIO / VENTA
      //   CODIGO   → código del plato (= Receta.codigo)
      //   UNIDADES → cantidad vendida (acumulada del período)
      // Descuenta stock: por cada plato vendido, consume sus ingredientes
      //   × UNIDADES × factor de merma. Genera Movimiento consumo_interno.
      // La fecha se toma de body.fecha (el período del reporte) o hoy.
      // ════════════════════════════════════════════════════════════════════
      const col = (row: any, ...cands: string[]): string => {
        const norm = (s: string) =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')            .toUpperCase().replace(/[^A-Z0-9]/g, '');
        const keys = Object.keys(row);
        for (const cand of cands) {
          const c = norm(cand);
          const hit = keys.find(k => {
            const nk = norm(k);
            return nk === c || nk.startsWith(c) || c.startsWith(nk);
          });
          if (hit && row[hit] !== undefined && row[hit] !== '') return String(row[hit]).trim();
        }
        return '';
      };
      const fechaVenta = (req.body?.fecha as string) || new Date().toISOString().split('T')[0];
      const horaVenta = '23:59';

      for (const row of datos) {
        try {
          const codPlato = col(row, 'CODIGO', 'COD_ART', 'CODART', 'RECETACODIGO');
          const unidades = parseFloat(
            String(col(row, 'UNIDADES', 'CANTIDAD', 'CANT')).replace(',', '.'),
          );
          if (!codPlato || !Number.isFinite(unidades) || unidades <= 0) continue;

          const receta = await prisma.receta.findFirst({
            where: { codigo: codPlato },
            include: { ingredientes: true },
          });
          if (!receta) {
            resultados.errores.push(`Receta no encontrada para venta: ${codPlato} (${col(row, 'NOMBRE')})`);
            continue;
          }
          if (receta.ingredientes.length === 0) {
            resultados.errores.push(`"${receta.nombre}" sin ingredientes cargados — no descuenta stock`);
            continue;
          }

          for (const ing of receta.ingredientes) {
            const mermaSafe = Math.min(Math.max(Number(ing.mermaEsperada) || 0, 0), 99);
            const factor = mermaSafe > 0 ? 1 / (1 - mermaSafe / 100) : 1;
            await prisma.movimiento.create({
              data: {
                tipo: 'consumo_interno',
                productoId: ing.productoId,
                cantidad: ing.cantidad * unidades * factor,
                unidad: ing.unidad,
                fecha: fechaVenta,
                hora: horaVenta,
                usuarioId: req.body?.usuarioId || 1,
                depositoOrigenId: req.body?.depositoOrigenId ? parseInt(req.body.depositoOrigenId) : null,
                observacion: `Venta Maxirest: ${receta.nombre} x${unidades}`,
              },
            });
          }
          resultados.insertados += receta.ingredientes.length;
        } catch (e: any) {
          resultados.errores.push(`Venta: ${e.message?.slice(0, 120)}`);
        }
      }
    } else {
      res.status(400).json({ error: `Tipo de importación no soportado: ${tipo}` });
      return;
    }

    res.json(resultados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al importar datos' });
  }
});

// GET /api/importar/plantillas/:tipo - Get template structure
router.get('/plantillas/:tipo', (req: Request, res: Response) => {
  const plantillas: Record<string, { columnas: string[]; ejemplo: Record<string, string> }> = {
    productos: {
      columnas: ['codigo', 'nombre', 'rubro', 'tipo', 'unidadCompra', 'unidadUso', 'factorConversion', 'stockMinimo', 'stockIdeal'],
      ejemplo: { codigo: 'INS-001', nombre: 'Papa', rubro: 'Verduras', tipo: 'crudo', unidadCompra: 'kg', unidadUso: 'kg', factorConversion: '1', stockMinimo: '5', stockIdeal: '20' }
    },
    proveedores: {
      columnas: ['codigo', 'nombre', 'contacto', 'telefono', 'email'],
      ejemplo: { codigo: 'PROV-001', nombre: 'Distribuidora Norte', contacto: 'Juan Pérez', telefono: '1155667788', email: 'ventas@norte.com' }
    },
    ventas: {
      columnas: ['recetaCodigo', 'cantidad', 'fecha', 'hora'],
      ejemplo: { recetaCodigo: 'REC-001', cantidad: '3', fecha: '2026-03-31', hora: '20:30' }
    },
    recetas: {
      columnas: ['codigo', 'nombre', 'categoria', 'sector', 'precioVenta', 'porciones'],
      ejemplo: { codigo: 'PLATO-001', nombre: 'Milanesa con papas', categoria: 'plato', sector: 'cocina', precioVenta: '8500', porciones: '1' }
    }
  };

  const tipo = req.params.tipo as string;
  if (!plantillas[tipo]) {
    res.status(404).json({ error: 'Plantilla no encontrada' });
    return;
  }

  res.json(plantillas[tipo]);
});

// GET /api/importar/mapeo-maxirest - Mapping config for Maxirest integration
router.get('/mapeo-maxirest', (_req: Request, res: Response) => {
  res.json({
    descripcion: 'Mapeo de columnas de archivos Maxirest a campos del sistema',
    ventas: {
      descripcion: 'Para importar ventas y calcular consumo teórico por receta',
      columnasEsperadas: ['Código Plato', 'Descripción', 'Cantidad', 'Fecha', 'Hora'],
      mapeoSugerido: {
        'Código Plato': 'recetaCodigo',
        'Cantidad': 'cantidad',
        'Fecha': 'fecha',
        'Hora': 'hora'
      }
    }
  });
});

// ============================================================================
// POST /api/importar/analizar-con-ia
// ----------------------------------------------------------------------------
// Cuando el parser estándar de Maxirest no encuentra las columnas esperadas
// (porque la versión de Maxirest del cliente exporta con nombres distintos),
// usamos Gemini para mapear las columnas crudas → campos canónicos del
// sistema. El usuario sube su archivo, vemos los headers + 3 filas, y la
// IA devuelve el mapeo.
//
// Body:
//   { tipo: 'productos' | 'proveedores' | 'recetas-maxirest' | 'ventas-maxirest',
//     headers: string[],
//     sampleRows: string[][]  (primeras 3-5 filas para que la IA infiera) }
//
// Devuelve:
//   { mapeo: { [columnaOrigen: string]: campoDestino },
//     confianza: 'alta'|'media'|'baja',
//     notas: string }
// ============================================================================

const CAMPOS_DESTINO: Record<string, string[]> = {
  productos: ['codigo', 'nombre', 'rubro', 'subrubro', 'tipo', 'unidadCompra', 'unidadUso', 'factorConversion', 'codigoBarras', 'precioReferencia', 'stockMinimo', 'stockIdeal'],
  proveedores: ['codigo', 'nombre', 'contacto', 'telefono', 'email', 'cuit', 'whatsapp', 'rubro'],
  'recetas-maxirest': ['COD_ART', 'ARTICULO', 'PORCIONES', 'RUBROART', 'COD_INS', 'INSUMO', 'RUBROINS', 'CANTIDAD', 'UNIDAD_MET', 'PUNIT', 'MARG'],
  'ventas-maxirest': ['CODIGO', 'NOMBRE', 'UNIDADES', 'PRECIO', 'VENTA'],
  recetas: ['codigo', 'nombre', 'categoria', 'sector', 'precioVenta', 'porciones'],
  ventas: ['recetaCodigo', 'cantidad', 'fecha', 'hora'],
  'codigos_barras': ['codigoProducto', 'codigo', 'factor', 'descripcion'],
};

router.post('/analizar-con-ia', async (req: Request, res: Response) => {
  try {
    const { tipo, headers, sampleRows } = req.body || {};
    if (!tipo || !Array.isArray(headers) || !Array.isArray(sampleRows)) {
      return res.status(400).json({ error: 'Se requiere tipo, headers[] y sampleRows[][]' });
    }
    const camposDestino = CAMPOS_DESTINO[tipo];
    if (!camposDestino) {
      return res.status(400).json({ error: `Tipo no soportado para IA: ${tipo}` });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'IA no disponible: GEMINI_API_KEY no configurada' });
    }

    // Sample reducido para no inflar el prompt
    const sample = sampleRows.slice(0, 5).map((r: any[]) =>
      headers.reduce((acc: any, h: string, i: number) => {
        acc[h] = String(r[i] ?? '').slice(0, 80);
        return acc;
      }, {})
    );

    const prompt = `Sos un asistente que mapea columnas de archivos CSV/Excel exportados por sistemas POS gastronómicos (Maxirest, Bistrosoft u otros) al esquema canónico de un sistema de stock.

TIPO DE IMPORTACIÓN: ${tipo}

CAMPOS DESTINO ESPERADOS (el sistema necesita estos):
${camposDestino.map(c => `- ${c}`).join('\n')}

COLUMNAS QUE TIENE EL ARCHIVO DEL USUARIO:
${headers.join(' | ')}

PRIMERAS FILAS (para que entiendas qué contiene cada columna):
${JSON.stringify(sample, null, 2)}

TU TAREA:
Devolver un OBJETO JSON con el mapeo columna-del-archivo → campo-destino. Solo
incluí los pares donde tengas alta o media confianza. Si una columna del
archivo no matchea ningún campo destino, NO la incluyas. Si un campo destino
no aparece en ningún header del archivo, NO lo incluyas (lo dejará vacío).

Reglas heurísticas:
- "COD_RUI" o "RUBRO_*" → rubro
- "COD_ART" / "CODIGO" → codigo
- "DESCRIPCION" / "NOMBRE" / "ARTICULO" → nombre
- "UNIDAD_MED" / "UNIDADMED" / "UM" / "UNIDAD" → unidadCompra (o UNIDAD_MET para recetas-maxirest)
- "PRECIO" / "PRECIO_UNITARIO" / "PUNIT" → precioReferencia (productos) o PUNIT (recetas)
- "STK_MIN" / "MINIMO" → stockMinimo
- "CANT" / "CANTIDAD" → cantidad o CANTIDAD según el tipo
- "INSUMO" + "ARTICULO" en el mismo archivo → es una receta-maxirest (long format)
- Identifica el SIGNIFICADO por contenido, no solo por nombre.

FORMATO DE RESPUESTA (JSON puro, sin markdown):
{
  "mapeo": { "ColumnaOrigen1": "campoDestino1", ... },
  "confianza": "alta" | "media" | "baja",
  "notas": "explicación breve de las decisiones, en una oración"
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Si Gemini devuelve markdown a pesar de pedir json, extraer
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(502).json({ error: 'La IA respondió con un formato no JSON', raw: text.slice(0, 300) });
      parsed = JSON.parse(m[0]);
    }

    // Validar que las keys de mapeo sean headers reales y los values sean campos destino conocidos
    const mapeo: Record<string, string> = {};
    const mapeoBruto = parsed?.mapeo || {};
    for (const [origen, destino] of Object.entries(mapeoBruto)) {
      if (typeof destino !== 'string') continue;
      if (!headers.includes(origen)) continue;
      if (!camposDestino.includes(destino)) continue;
      mapeo[origen] = destino;
    }

    res.json({
      mapeo,
      confianza: ['alta', 'media', 'baja'].includes(parsed?.confianza) ? parsed.confianza : 'media',
      notas: typeof parsed?.notas === 'string' ? parsed.notas.slice(0, 300) : '',
      camposNoMapeados: camposDestino.filter(c => !Object.values(mapeo).includes(c)),
    });
  } catch (e: any) {
    console.error('[importar/analizar-con-ia]', e);
    res.status(500).json({ error: e?.message || 'Error analizando con IA' });
  }
});

// ============================================================================
// POST /api/importar/recetas-pdf
// ----------------------------------------------------------------------------
// Acepta el PDF "Recetas de artículos" exportado por Maxirest pro7.3 y devuelve
// las filas planas (1 por ingrediente) listas para mandar al endpoint
// /importar/csv con tipo='recetas-maxirest'. Así reutilizamos toda la lógica
// de creación de Receta + Producto + RecetaIngrediente que ya existe.
//
// El PDF tiene un layout fijo por artículo:
//   <codigo> <nombre>\tArtículo:                ← header (1 a N líneas)
//   Ingredientes: Cantidad ...                  ← cabecera fija
//   <codInsumo>\t<cant> <unidad> <insumo> <punit>  **********
//   ...
//   Preparación: / Costo / Margen / Especificaciones — ruido
//
// El parser:
//   1. Tokeniza líneas y descarta header/footer de página
//   2. Acumula líneas sueltas en buffer; al encontrar "Artículo:" (con o sin
//      contenido previo en la misma línea), cierra la receta previa y arma
//      el header juntando el buffer
//   3. Las líneas tipo costo/margen/% sueltos limpian el buffer (son ruido
//      entre recetas, no continuación del nombre)
// ============================================================================
router.post('/recetas-pdf', pdfUpload.single('archivo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Faltó el archivo PDF' });
    }
    const ext = (req.file.originalname || '').toLowerCase().split('.').pop();
    if (ext !== 'pdf') {
      return res.status(400).json({ error: 'Solo se acepta .pdf' });
    }

    const { PDFParse } = await import('pdf-parse');
    const pdf = new PDFParse({ data: req.file.buffer });
    const result = await pdf.getText();
    await pdf.destroy();

    const lines = result.text.split('\n').map((l: string) => l.replace(/\s+$/, ''));

    const NOISE_RE = /(Recetas de art|maxirest pro|Página:|Usuario:|Fecha:|Ingredientes:|Preparación:|Especificaciones:|Costo total|Costo estructural|Costo:|Margen:|--\s*\d+\s+of\s+\d+\s*--)/i;
    const LOOSE_NUM_RE = /^[\d.,]+%?\s*$/;
    const ING_RE = /^(\d+)\t([\d.,]+)\s+(\S+)\s+(.+?)\s+([\d.,]+)\s+\*+\s*$/;
    const ART_END_RE = /^(.*?)Artículo:\s*$/;
    const RUBRO_END_RE = /^(.*?)Rubro:\s*$/;
    const HEADER_CODE_NOMBRE = /^(\d+)\s+(.+)$/;

    type Receta = {
      codArticulo: string;
      articulo: string;
      ingredientes: Array<{
        codInsumo: string;
        cantidad: number;
        unidad: string;
        insumo: string;
        punit: number;
      }>;
    };
    const recetas: Receta[] = [];
    let buffer: string[] = [];
    let actual: Receta | null = null;
    const flushActual = () => {
      if (actual && actual.ingredientes.length) recetas.push(actual);
      actual = null;
    };

    for (const ln of lines) {
      if (!ln || !ln.trim()) continue;

      const mArt = ln.match(ART_END_RE);
      if (mArt) {
        flushActual();
        const partes = [...buffer, mArt[1]]
          .map(s => s.replace(/\t/g, ' ').trim())
          .filter(Boolean);
        buffer = [];
        const joined = partes.join(' ').replace(/\s+/g, ' ').trim();
        const mHC = joined.match(HEADER_CODE_NOMBRE);
        if (!mHC) continue;
        actual = { codArticulo: mHC[1], articulo: mHC[2].trim(), ingredientes: [] };
        continue;
      }
      const mRubro = ln.match(RUBRO_END_RE);
      if (mRubro) { buffer = []; continue; }
      if (NOISE_RE.test(ln) || LOOSE_NUM_RE.test(ln.trim())) { buffer = []; continue; }

      const mIng = ln.match(ING_RE);
      if (mIng) {
        if (!actual) continue;
        const [, codIns, cantStr, unidad, nombre, punitStr] = mIng;
        actual.ingredientes.push({
          codInsumo: codIns,
          cantidad: parseFloat(cantStr.replace(',', '.')) || 0,
          unidad: unidad.trim(),
          insumo: nombre.trim(),
          punit: parseFloat(punitStr.replace(/,/g, '')) || 0,
        });
        continue;
      }

      buffer.push(ln);
    }
    flushActual();

    // Convertir al formato "1 fila por ingrediente" que consume recetas-maxirest
    const datos: Array<Record<string, any>> = [];
    for (const r of recetas) {
      for (const ing of r.ingredientes) {
        datos.push({
          COD_ART: r.codArticulo,
          ARTICULO: r.articulo,
          PORCIONES: 1,
          RUBROART: '',
          COD_INS: ing.codInsumo,
          INSUMO: ing.insumo,
          RUBROINS: '',
          CANTIDAD: ing.cantidad,
          UNIDAD_MET: ing.unidad,
          PUNIT: ing.punit,
          MARG: 70,
        });
      }
    }

    res.json({
      ok: true,
      recetasDetectadas: recetas.length,
      ingredientesDetectados: datos.length,
      headers: ['COD_ART', 'ARTICULO', 'PORCIONES', 'RUBROART', 'COD_INS', 'INSUMO', 'RUBROINS', 'CANTIDAD', 'UNIDAD_MET', 'PUNIT', 'MARG'],
      datos,
      preview: recetas.slice(0, 5).map(r => ({
        codigo: r.codArticulo,
        nombre: r.articulo,
        ingredientes: r.ingredientes.length,
      })),
    });
  } catch (e: any) {
    console.error('[importar/recetas-pdf]', e);
    res.status(500).json({ error: e?.message || 'Error parseando PDF de recetas' });
  }
});

export default router;
