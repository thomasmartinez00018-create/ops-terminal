import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

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
      for (const row of datos) {
        try {
          const data: any = mapeo
            ? Object.fromEntries(Object.entries(mapeo).map(([o, d]) => [d, row[o]]).filter(([, v]) => v !== undefined && v !== ''))
            : { ...row };

          if (!data.codigo || !data.nombre) {
            resultados.errores.push(`Proveedor sin código o nombre`);
            continue;
          }

          const existing = await prisma.proveedor.findFirst({ where: { codigo: data.codigo } });
          if (existing) {
            await prisma.proveedor.update({ where: { id: existing.id }, data });
            resultados.actualizados++;
          } else {
            await prisma.proveedor.create({ data });
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

export default router;
