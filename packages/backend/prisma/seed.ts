import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Depósitos
  const depositos = await Promise.all([
    prisma.deposito.upsert({ where: { codigo: 'DEP-01' }, update: {}, create: { codigo: 'DEP-01', nombre: 'Depósito Central', tipo: 'almacen' } }),
    prisma.deposito.upsert({ where: { codigo: 'COC-01' }, update: {}, create: { codigo: 'COC-01', nombre: 'Cocina', tipo: 'cocina' } }),
    prisma.deposito.upsert({ where: { codigo: 'BAR-01' }, update: {}, create: { codigo: 'BAR-01', nombre: 'Barra', tipo: 'barra' } }),
    prisma.deposito.upsert({ where: { codigo: 'CAM-01' }, update: {}, create: { codigo: 'CAM-01', nombre: 'Cámara Fría', tipo: 'camara' } }),
    prisma.deposito.upsert({ where: { codigo: 'FRE-01' }, update: {}, create: { codigo: 'FRE-01', nombre: 'Freezer', tipo: 'freezer' } }),
    prisma.deposito.upsert({ where: { codigo: 'SEC-01' }, update: {}, create: { codigo: 'SEC-01', nombre: 'Depósito Seco', tipo: 'seco' } }),
  ]);

  // Usuarios
  await Promise.all([
    prisma.usuario.upsert({ where: { codigo: 'ADM-01' }, update: {}, create: { codigo: 'ADM-01', nombre: 'Administrador', rol: 'admin', pin: '1234' } }),
    prisma.usuario.upsert({ where: { codigo: 'COC-01' }, update: {}, create: { codigo: 'COC-01', nombre: 'Jefe de Cocina', rol: 'cocina', pin: '1111' } }),
    prisma.usuario.upsert({ where: { codigo: 'DEP-01' }, update: {}, create: { codigo: 'DEP-01', nombre: 'Encargado Depósito', rol: 'deposito', pin: '2222' } }),
    prisma.usuario.upsert({ where: { codigo: 'BAR-01' }, update: {}, create: { codigo: 'BAR-01', nombre: 'Barman', rol: 'barra', pin: '3333' } }),
  ]);

  // Productos de ejemplo
  const depCentral = depositos[0];
  await Promise.all([
    prisma.producto.upsert({ where: { codigo: 'INS-001' }, update: {}, create: { codigo: 'INS-001', nombre: 'Papa', rubro: 'Verduras', tipo: 'crudo', unidadCompra: 'kg', unidadUso: 'kg', stockMinimo: 10, stockIdeal: 50, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'INS-002' }, update: {}, create: { codigo: 'INS-002', nombre: 'Cebolla', rubro: 'Verduras', tipo: 'crudo', unidadCompra: 'kg', unidadUso: 'kg', stockMinimo: 5, stockIdeal: 20, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'INS-003' }, update: {}, create: { codigo: 'INS-003', nombre: 'Aceite de oliva', rubro: 'Aceites', tipo: 'insumo', unidadCompra: 'lt', unidadUso: 'lt', stockMinimo: 5, stockIdeal: 20, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'CAR-001' }, update: {}, create: { codigo: 'CAR-001', nombre: 'Bife de chorizo', rubro: 'Carnes', tipo: 'crudo', unidadCompra: 'kg', unidadUso: 'kg', stockMinimo: 5, stockIdeal: 15, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'CAR-002' }, update: {}, create: { codigo: 'CAR-002', nombre: 'Pollo entero', rubro: 'Carnes', tipo: 'crudo', unidadCompra: 'kg', unidadUso: 'kg', stockMinimo: 5, stockIdeal: 20, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'LAC-001' }, update: {}, create: { codigo: 'LAC-001', nombre: 'Crema de leche', rubro: 'Lácteos', tipo: 'insumo', unidadCompra: 'lt', unidadUso: 'lt', stockMinimo: 3, stockIdeal: 10, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'LAC-002' }, update: {}, create: { codigo: 'LAC-002', nombre: 'Queso mozzarella', rubro: 'Lácteos', tipo: 'insumo', unidadCompra: 'kg', unidadUso: 'kg', stockMinimo: 2, stockIdeal: 8, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'BEB-001' }, update: {}, create: { codigo: 'BEB-001', nombre: 'Vino Malbec (botella)', rubro: 'Bebidas', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad', stockMinimo: 10, stockIdeal: 30, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'ELA-001' }, update: {}, create: { codigo: 'ELA-001', nombre: 'Salsa de tomate casera', rubro: 'Elaborados', tipo: 'elaborado', unidadCompra: 'lt', unidadUso: 'lt', stockMinimo: 2, stockIdeal: 8, depositoDefectoId: depCentral.id } }),
    prisma.producto.upsert({ where: { codigo: 'ELA-002' }, update: {}, create: { codigo: 'ELA-002', nombre: 'Masa de empanada', rubro: 'Elaborados', tipo: 'elaborado', unidadCompra: 'unidad', unidadUso: 'unidad', stockMinimo: 20, stockIdeal: 100, depositoDefectoId: depCentral.id } }),
  ]);

  console.log('✅ Seed completado');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
