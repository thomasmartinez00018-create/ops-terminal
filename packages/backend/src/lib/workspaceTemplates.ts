// ============================================================================
// Workspace Templates — plantillas de rubro para onboarding
// ============================================================================
// Cada template describe qué depósitos y productos precargar cuando se crea
// un workspace nuevo. 100% estático (cero LLM, cero llamadas externas). La
// idea es bajar la fricción de entrada: el user elige "kiosco" y ya tiene
// 30 productos + 3 depósitos listos, no una app vacía.
//
// Los códigos son deterministas y cortos. Si el user quiere limpiar, los borra.
// NO creamos usuarios staff, recetas, ni proveedores por template: esas son
// decisiones del dueño y meternos ahí sería ruidoso.
// ============================================================================

import { prismaRaw } from './prisma';

export interface TemplateDeposito {
  codigo: string;
  nombre: string;
  tipo: 'almacen' | 'cocina' | 'barra' | 'freezer' | 'camara' | 'seco';
}

export interface TemplateProducto {
  codigo: string;
  nombre: string;
  rubro: string;
  subrubro?: string;
  tipo: 'crudo' | 'elaborado' | 'semielaborado' | 'insumo';
  unidadCompra: string;
  unidadUso: string;
  factorConversion?: number;
  stockMinimo?: number;
  stockIdeal?: number;
}

export interface WorkspaceTemplate {
  id: string;                  // slug estable: 'kiosco', 'restaurante', etc
  nombre: string;              // "Kiosco / Maxikiosco"
  descripcion: string;         // 1 línea para la card
  icono: string;               // nombre del ícono lucide-react
  color: string;               // hex o clase tailwind para acento visual
  depositos: TemplateDeposito[];
  productos: TemplateProducto[];
}

// ── Helpers de construcción ─────────────────────────────────────────────────
// Función para generar códigos secuenciales dentro de cada template sin tener
// que escribirlos a mano 30 veces.
function cods(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

// ============================================================================
// TEMPLATE 1: Kiosco / Maxikiosco
// ============================================================================
const KIOSCO: WorkspaceTemplate = {
  id: 'kiosco',
  nombre: 'Kiosco / Maxikiosco',
  descripcion: 'Bebidas, golosinas, cigarrillos, snacks. Para el kiosco de barrio.',
  icono: 'Store',
  color: '#F59E0B',
  depositos: [
    { codigo: 'LOC-01', nombre: 'Local / Exhibidor',   tipo: 'almacen' },
    { codigo: 'DEP-01', nombre: 'Depósito de reserva', tipo: 'seco' },
    { codigo: 'HEL-01', nombre: 'Heladera',            tipo: 'camara' },
  ],
  productos: [
    // Bebidas
    { codigo: cods('BEB', 1),  nombre: 'Coca-Cola 500ml',           rubro: 'Bebidas',    subrubro: 'Gaseosas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 2),  nombre: 'Coca-Cola 1.5L',            rubro: 'Bebidas',    subrubro: 'Gaseosas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 3),  nombre: 'Sprite 500ml',              rubro: 'Bebidas',    subrubro: 'Gaseosas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 4),  nombre: 'Manaos Cola 2.25L',         rubro: 'Bebidas',    subrubro: 'Gaseosas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 5),  nombre: 'Agua Villavicencio 500ml',  rubro: 'Bebidas',    subrubro: 'Aguas',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 6),  nombre: 'Agua Saborizada Levité',    rubro: 'Bebidas',    subrubro: 'Aguas',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 7),  nombre: 'Cerveza Quilmes 1L',        rubro: 'Bebidas',    subrubro: 'Cervezas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 8),  nombre: 'Energizante Speed',         rubro: 'Bebidas',    subrubro: 'Energéticas',tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Golosinas
    { codigo: cods('GOL', 1),  nombre: 'Alfajor Jorgito',           rubro: 'Golosinas',  subrubro: 'Alfajores',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 2),  nombre: 'Alfajor Guaymallén',        rubro: 'Golosinas',  subrubro: 'Alfajores',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 3),  nombre: 'Alfajor Milka',             rubro: 'Golosinas',  subrubro: 'Alfajores',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 4),  nombre: 'Chocolatín Cofler',         rubro: 'Golosinas',  subrubro: 'Chocolates', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 5),  nombre: 'Tita',                      rubro: 'Golosinas',  subrubro: 'Chocolates', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 6),  nombre: 'Rhodesia',                  rubro: 'Golosinas',  subrubro: 'Chocolates', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 7),  nombre: 'Chupetín Pico Dulce',       rubro: 'Golosinas',  subrubro: 'Caramelos',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GOL', 8),  nombre: 'Chicle Bubbaloo',           rubro: 'Golosinas',  subrubro: 'Chicles',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Snacks
    { codigo: cods('SNK', 1),  nombre: 'Papas Lays Clásicas',       rubro: 'Snacks',     subrubro: 'Papas',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('SNK', 2),  nombre: 'Palitos Krachitos',         rubro: 'Snacks',     subrubro: 'Salados',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('SNK', 3),  nombre: '3D Queso',                  rubro: 'Snacks',     subrubro: 'Salados',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('SNK', 4),  nombre: 'Pringles',                  rubro: 'Snacks',     subrubro: 'Papas',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Galletitas
    { codigo: cods('GAL', 1),  nombre: 'Oreo',                      rubro: 'Galletitas', subrubro: 'Dulces',     tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GAL', 2),  nombre: 'Pepitos',                   rubro: 'Galletitas', subrubro: 'Dulces',     tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('GAL', 3),  nombre: 'Criollitas',                rubro: 'Galletitas', subrubro: 'Saladas',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Cigarrillos
    { codigo: cods('CIG', 1),  nombre: 'Marlboro Box',              rubro: 'Cigarrillos',                         tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CIG', 2),  nombre: 'Philip Morris KS',          rubro: 'Cigarrillos',                         tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CIG', 3),  nombre: 'Camel',                     rubro: 'Cigarrillos',                         tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Varios
    { codigo: cods('VAR', 1),  nombre: 'Encendedor Bic',            rubro: 'Varios',                              tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('VAR', 2),  nombre: 'Preservativo Prime',        rubro: 'Varios',                              tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
  ],
};

// ============================================================================
// TEMPLATE 2: Restaurante / Parrilla
// ============================================================================
const RESTAURANTE: WorkspaceTemplate = {
  id: 'restaurante',
  nombre: 'Restaurante / Parrilla',
  descripcion: 'Cocina completa con carnes, verduras, almacén seco y barra.',
  icono: 'ChefHat',
  color: '#DC2626',
  depositos: [
    { codigo: 'COC-01', nombre: 'Cocina',          tipo: 'cocina' },
    { codigo: 'BAR-01', nombre: 'Barra',           tipo: 'barra' },
    { codigo: 'SEC-01', nombre: 'Depósito Seco',   tipo: 'seco' },
    { codigo: 'CAM-01', nombre: 'Cámara Fría',     tipo: 'camara' },
    { codigo: 'FRE-01', nombre: 'Freezer',         tipo: 'freezer' },
  ],
  productos: [
    // Carnes
    { codigo: cods('CAR', 1),  nombre: 'Bife de Chorizo',    rubro: 'Carnes',      subrubro: 'Vacuno',  tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 2),  nombre: 'Vacío',              rubro: 'Carnes',      subrubro: 'Vacuno',  tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 3),  nombre: 'Entraña',            rubro: 'Carnes',      subrubro: 'Vacuno',  tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 4),  nombre: 'Ojo de Bife',        rubro: 'Carnes',      subrubro: 'Vacuno',  tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 5),  nombre: 'Tira de Asado',      rubro: 'Carnes',      subrubro: 'Vacuno',  tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 6),  nombre: 'Matambre',           rubro: 'Carnes',      subrubro: 'Vacuno',  tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 7),  nombre: 'Pollo Entero',       rubro: 'Carnes',      subrubro: 'Aves',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 8),  nombre: 'Pechuga de Pollo',   rubro: 'Carnes',      subrubro: 'Aves',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAR', 9),  nombre: 'Chorizo Parrillero', rubro: 'Carnes',      subrubro: 'Embutidos', tipo: 'crudo', unidadCompra: 'kg',   unidadUso: 'kg' },
    { codigo: cods('CAR', 10), nombre: 'Morcilla',           rubro: 'Carnes',      subrubro: 'Embutidos', tipo: 'crudo', unidadCompra: 'kg',   unidadUso: 'kg' },
    // Verduras
    { codigo: cods('VER', 1),  nombre: 'Papa',               rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 2),  nombre: 'Cebolla',            rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 3),  nombre: 'Tomate',             rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 4),  nombre: 'Lechuga',            rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('VER', 5),  nombre: 'Zanahoria',          rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 6),  nombre: 'Ajo',                rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 7),  nombre: 'Morrón Rojo',        rubro: 'Verduras',    tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    // Almacén
    { codigo: cods('ALM', 1),  nombre: 'Aceite de Oliva',    rubro: 'Aceites',     tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('ALM', 2),  nombre: 'Aceite de Girasol',  rubro: 'Aceites',     tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('ALM', 3),  nombre: 'Sal Parrillera',     rubro: 'Condimentos', tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ALM', 4),  nombre: 'Sal Fina',           rubro: 'Condimentos', tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ALM', 5),  nombre: 'Pimienta Negra',     rubro: 'Condimentos', tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ALM', 6),  nombre: 'Orégano',            rubro: 'Condimentos', tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ALM', 7),  nombre: 'Chimichurri',        rubro: 'Condimentos', tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ALM', 8),  nombre: 'Harina 000',         rubro: 'Panadería',   tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    // Lácteos
    { codigo: cods('LAC', 1),  nombre: 'Muzzarella',         rubro: 'Lácteos',     tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('LAC', 2),  nombre: 'Queso Cremoso',      rubro: 'Lácteos',     tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('LAC', 3),  nombre: 'Huevo',              rubro: 'Lácteos',     tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('LAC', 4),  nombre: 'Leche Entera',       rubro: 'Lácteos',     tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    // Bebidas
    { codigo: cods('BEB', 1),  nombre: 'Vino Tinto Malbec',  rubro: 'Vinos',       subrubro: 'Tintos',     tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 2),  nombre: 'Vino Blanco Chardonnay', rubro: 'Vinos',   subrubro: 'Blancos',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 3),  nombre: 'Cerveza Quilmes 1L', rubro: 'Bebidas',     subrubro: 'Cervezas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 4),  nombre: 'Agua Mineral 500ml', rubro: 'Bebidas',     subrubro: 'Aguas',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 5),  nombre: 'Coca-Cola 1.5L',     rubro: 'Bebidas',     subrubro: 'Gaseosas',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
  ],
};

// ============================================================================
// TEMPLATE 3: Sushi
// ============================================================================
const SUSHI: WorkspaceTemplate = {
  id: 'sushi',
  nombre: 'Sushi / Cocina Japonesa',
  descripcion: 'Pescados, arroz, algas y condimentos asiáticos. Para sushi bar.',
  icono: 'Fish',
  color: '#0891B2',
  depositos: [
    { codigo: 'COC-01', nombre: 'Cocina',        tipo: 'cocina' },
    { codigo: 'BAR-01', nombre: 'Barra Sushi',   tipo: 'barra' },
    { codigo: 'CAM-01', nombre: 'Cámara Fría',   tipo: 'camara' },
    { codigo: 'FRE-01', nombre: 'Freezer',       tipo: 'freezer' },
    { codigo: 'SEC-01', nombre: 'Depósito Seco', tipo: 'seco' },
  ],
  productos: [
    // Pescados
    { codigo: cods('PES', 1),  nombre: 'Salmón Rosado',       rubro: 'Pescados',    subrubro: 'Rosados', tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('PES', 2),  nombre: 'Atún Rojo',           rubro: 'Pescados',    subrubro: 'Rojos',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('PES', 3),  nombre: 'Pez Blanco',          rubro: 'Pescados',    subrubro: 'Blancos', tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('PES', 4),  nombre: 'Langostinos',         rubro: 'Pescados',    subrubro: 'Mariscos',tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('PES', 5),  nombre: 'Kanikama',            rubro: 'Pescados',    subrubro: 'Procesados',tipo: 'insumo',unidadCompra: 'kg',   unidadUso: 'kg' },
    // Arroces y algas
    { codigo: cods('ARR', 1),  nombre: 'Arroz Koshihikari',   rubro: 'Arroces',     tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ARR', 2),  nombre: 'Arroz Gohan',         rubro: 'Arroces',     tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('ALG', 1),  nombre: 'Alga Nori',           rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'unidad',unidadUso: 'unidad' },
    // Condimentos asiáticos
    { codigo: cods('CON', 1),  nombre: 'Salsa de Soja',       rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'lt',   unidadUso: 'lt' },
    { codigo: cods('CON', 2),  nombre: 'Wasabi en Pasta',     rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'kg',   unidadUso: 'kg' },
    { codigo: cods('CON', 3),  nombre: 'Jengibre Encurtido',  rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'kg',   unidadUso: 'kg' },
    { codigo: cods('CON', 4),  nombre: 'Vinagre de Arroz',    rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'lt',   unidadUso: 'lt' },
    { codigo: cods('CON', 5),  nombre: 'Mirin',               rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'lt',   unidadUso: 'lt' },
    { codigo: cods('CON', 6),  nombre: 'Sake para Cocinar',   rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'lt',   unidadUso: 'lt' },
    { codigo: cods('CON', 7),  nombre: 'Sésamo Blanco',       rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'kg',   unidadUso: 'kg' },
    { codigo: cods('CON', 8),  nombre: 'Sésamo Negro',        rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'kg',   unidadUso: 'kg' },
    { codigo: cods('CON', 9),  nombre: 'Aceite de Sésamo',    rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'lt',   unidadUso: 'lt' },
    { codigo: cods('CON', 10), nombre: 'Panko',               rubro: 'Condimentos', subrubro: 'Asiáticos',tipo: 'insumo',unidadCompra: 'kg',   unidadUso: 'kg' },
    // Frutas y verduras
    { codigo: cods('VER', 1),  nombre: 'Palta',               rubro: 'Verduras',    tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 2),  nombre: 'Pepino',              rubro: 'Verduras',    tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 3),  nombre: 'Cebolla de Verdeo',   rubro: 'Verduras',    tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 1),  nombre: 'Mango',               rubro: 'Frutas',      tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    // Lácteos
    { codigo: cods('LAC', 1),  nombre: 'Queso Philadelphia',  rubro: 'Lácteos',     tipo: 'insumo', unidadCompra: 'kg',    unidadUso: 'kg' },
    // Bebidas
    { codigo: cods('BEB', 1),  nombre: 'Sake Premium',        rubro: 'Bebidas',     subrubro: 'Asiáticas', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 2),  nombre: 'Cerveza Sapporo',     rubro: 'Bebidas',     subrubro: 'Cervezas',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
  ],
};

// ============================================================================
// TEMPLATE 4: Bar / Cervecería
// ============================================================================
const BAR: WorkspaceTemplate = {
  id: 'bar',
  nombre: 'Bar / Cervecería',
  descripcion: 'Destilados, vinos, cervezas y snacks. Para bar, boliche, after office.',
  icono: 'Wine',
  color: '#7C3AED',
  depositos: [
    { codigo: 'BAR-01', nombre: 'Barra',         tipo: 'barra' },
    { codigo: 'COC-01', nombre: 'Cocina',        tipo: 'cocina' },
    { codigo: 'SEC-01', nombre: 'Depósito Seco', tipo: 'seco' },
    { codigo: 'CAM-01', nombre: 'Cámara Fría',   tipo: 'camara' },
    { codigo: 'FRE-01', nombre: 'Freezer',       tipo: 'freezer' },
  ],
  productos: [
    // Destilados
    { codigo: cods('DES', 1),  nombre: 'Gin Beefeater',         rubro: 'Destilados', subrubro: 'Gin',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 2),  nombre: 'Gin Bombay Sapphire',   rubro: 'Destilados', subrubro: 'Gin',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 3),  nombre: 'Vermouth Cinzano Rosso',rubro: 'Destilados', subrubro: 'Vermouth', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 4),  nombre: 'Campari',               rubro: 'Destilados', subrubro: 'Amargos',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 5),  nombre: 'Aperol',                rubro: 'Destilados', subrubro: 'Amargos',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 6),  nombre: 'Fernet Branca',         rubro: 'Destilados', subrubro: 'Amargos',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 7),  nombre: 'Ron Bacardi',           rubro: 'Destilados', subrubro: 'Ron',      tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 8),  nombre: 'Whisky Johnnie Walker', rubro: 'Destilados', subrubro: 'Whisky',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 9),  nombre: 'Vodka Absolut',         rubro: 'Destilados', subrubro: 'Vodka',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 10), nombre: 'Tequila José Cuervo',   rubro: 'Destilados', subrubro: 'Tequila',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('DES', 11), nombre: 'Jagermeister',          rubro: 'Destilados', subrubro: 'Licores',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Cervezas
    { codigo: cods('CER', 1),  nombre: 'Cerveza Stella Artois', rubro: 'Bebidas',    subrubro: 'Cervezas', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CER', 2),  nombre: 'Cerveza Patagonia IPA', rubro: 'Bebidas',    subrubro: 'Cervezas', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CER', 3),  nombre: 'Cerveza Quilmes',       rubro: 'Bebidas',    subrubro: 'Cervezas', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CER', 4),  nombre: 'Cerveza Andes',         rubro: 'Bebidas',    subrubro: 'Cervezas', tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Vinos
    { codigo: cods('VIN', 1),  nombre: 'Vino Malbec',           rubro: 'Vinos',      subrubro: 'Tintos',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('VIN', 2),  nombre: 'Vino Sauvignon Blanc',  rubro: 'Vinos',      subrubro: 'Blancos',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('VIN', 3),  nombre: 'Espumante Chandon',     rubro: 'Vinos',      subrubro: 'Espumantes',tipo: 'insumo',unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Insumos coctelería
    { codigo: cods('COC', 1),  nombre: 'Agua Tónica',           rubro: 'Bebidas',    subrubro: 'Sin alcohol',tipo: 'insumo',unidadCompra: 'unidad',unidadUso: 'unidad' },
    { codigo: cods('COC', 2),  nombre: 'Soda',                  rubro: 'Bebidas',    subrubro: 'Sin alcohol',tipo: 'insumo',unidadCompra: 'unidad',unidadUso: 'unidad' },
    { codigo: cods('COC', 3),  nombre: 'Jarabe de Granadina',   rubro: 'Condimentos',subrubro: 'Coctelería',tipo: 'insumo',unidadCompra: 'lt',    unidadUso: 'lt' },
    { codigo: cods('COC', 4),  nombre: 'Jarabe de Goma',        rubro: 'Condimentos',subrubro: 'Coctelería',tipo: 'insumo',unidadCompra: 'lt',    unidadUso: 'lt' },
    // Frutas y guarniciones
    { codigo: cods('FRU', 1),  nombre: 'Lima',                  rubro: 'Frutas',     tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 2),  nombre: 'Limón',                 rubro: 'Frutas',     tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 3),  nombre: 'Naranja',               rubro: 'Frutas',     tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 4),  nombre: 'Pomelo',                rubro: 'Frutas',     tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 5),  nombre: 'Menta Fresca',          rubro: 'Verduras',   tipo: 'crudo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 6),  nombre: 'Aceituna Verde',        rubro: 'Condimentos',tipo: 'insumo',unidadCompra: 'kg',     unidadUso: 'kg' },
    // Snacks
    { codigo: cods('SNK', 1),  nombre: 'Maní',                  rubro: 'Snacks',     tipo: 'insumo',unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('SNK', 2),  nombre: 'Papas Fritas Lays',     rubro: 'Snacks',     tipo: 'insumo',unidadCompra: 'unidad', unidadUso: 'unidad' },
  ],
};

// ============================================================================
// TEMPLATE 5: Pizzería
// ============================================================================
const PIZZERIA: WorkspaceTemplate = {
  id: 'pizzeria',
  nombre: 'Pizzería',
  descripcion: 'Harinas, muzza, tomate y fiambres. Lo típico de una pizzería al paso o al molde.',
  icono: 'Pizza',
  color: '#EA580C',
  depositos: [
    { codigo: 'COC-01', nombre: 'Cocina',          tipo: 'cocina' },
    { codigo: 'HOR-01', nombre: 'Horno',           tipo: 'cocina' },
    { codigo: 'SEC-01', nombre: 'Depósito Seco',   tipo: 'seco' },
    { codigo: 'CAM-01', nombre: 'Cámara Fría',     tipo: 'camara' },
    { codigo: 'BAR-01', nombre: 'Barra',           tipo: 'barra' },
  ],
  productos: [
    // Harinas y masa
    { codigo: cods('HAR', 1),  nombre: 'Harina 000',           rubro: 'Panadería',  tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('HAR', 2),  nombre: 'Harina 0000',          rubro: 'Panadería',  tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('HAR', 3),  nombre: 'Levadura Fresca',      rubro: 'Panadería',  tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('HAR', 4),  nombre: 'Sal Gruesa',           rubro: 'Condimentos',tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('HAR', 5),  nombre: 'Aceite de Oliva',      rubro: 'Aceites',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('HAR', 6),  nombre: 'Aceite de Girasol',    rubro: 'Aceites',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    // Lácteos
    { codigo: cods('LAC', 1),  nombre: 'Muzzarella',           rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('LAC', 2),  nombre: 'Queso Parmesano',      rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('LAC', 3),  nombre: 'Queso Roquefort',      rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('LAC', 4),  nombre: 'Huevo',                rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Salsas y tomates
    { codigo: cods('SAL', 1),  nombre: 'Salsa de Tomate',      rubro: 'Condimentos',tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('SAL', 2),  nombre: 'Tomate Perita Enlatado',rubro: 'Condimentos',tipo: 'insumo',unidadCompra: 'kg',    unidadUso: 'kg' },
    // Fiambres y carnes
    { codigo: cods('FIA', 1),  nombre: 'Jamón Cocido',         rubro: 'Carnes',     subrubro: 'Fiambres',tipo: 'insumo', unidadCompra: 'kg', unidadUso: 'kg' },
    { codigo: cods('FIA', 2),  nombre: 'Panceta Ahumada',      rubro: 'Carnes',     subrubro: 'Fiambres',tipo: 'insumo', unidadCompra: 'kg', unidadUso: 'kg' },
    { codigo: cods('FIA', 3),  nombre: 'Salame',               rubro: 'Carnes',     subrubro: 'Fiambres',tipo: 'insumo', unidadCompra: 'kg', unidadUso: 'kg' },
    { codigo: cods('FIA', 4),  nombre: 'Anchoas',              rubro: 'Pescados',   tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    // Verduras
    { codigo: cods('VER', 1),  nombre: 'Cebolla',              rubro: 'Verduras',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 2),  nombre: 'Morrón',               rubro: 'Verduras',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 3),  nombre: 'Champignones',         rubro: 'Verduras',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 4),  nombre: 'Aceitunas Verdes',     rubro: 'Condimentos',tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 5),  nombre: 'Aceitunas Negras',     rubro: 'Condimentos',tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 6),  nombre: 'Albahaca',             rubro: 'Verduras',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 7),  nombre: 'Ajo',                  rubro: 'Verduras',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 8),  nombre: 'Orégano',              rubro: 'Condimentos',tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 9),  nombre: 'Rúcula',               rubro: 'Verduras',   tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('VER', 10), nombre: 'Palmitos',             rubro: 'Condimentos',tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    // Bebidas
    { codigo: cods('BEB', 1),  nombre: 'Cerveza Quilmes',      rubro: 'Bebidas',    subrubro: 'Cervezas',tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 2),  nombre: 'Coca-Cola 1.5L',       rubro: 'Bebidas',    subrubro: 'Gaseosas',tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 3),  nombre: 'Vino Tinto',           rubro: 'Vinos',      subrubro: 'Tintos',  tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
  ],
};

// ============================================================================
// TEMPLATE 6: Cafetería / Coffee Shop
// ============================================================================
const CAFETERIA: WorkspaceTemplate = {
  id: 'cafeteria',
  nombre: 'Cafetería / Coffee Shop',
  descripcion: 'Café, leches, medialunas y tostados. Para cafetería de especialidad o desayuno.',
  icono: 'Coffee',
  color: '#92400E',
  depositos: [
    { codigo: 'BAR-01', nombre: 'Barra',         tipo: 'barra' },
    { codigo: 'COC-01', nombre: 'Cocina',        tipo: 'cocina' },
    { codigo: 'SEC-01', nombre: 'Depósito Seco', tipo: 'seco' },
    { codigo: 'CAM-01', nombre: 'Cámara Fría',   tipo: 'camara' },
  ],
  productos: [
    // Cafés y tés
    { codigo: cods('CAF', 1),  nombre: 'Café en Grano Arábica', rubro: 'Cafés',      tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAF', 2),  nombre: 'Café Molido',           rubro: 'Cafés',      tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAF', 3),  nombre: 'Café Descafeinado',     rubro: 'Cafés',      tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('CAF', 4),  nombre: 'Té Negro',              rubro: 'Tés',        tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CAF', 5),  nombre: 'Té Verde',              rubro: 'Tés',        tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CAF', 6),  nombre: 'Manzanilla',            rubro: 'Tés',        tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('CAF', 7),  nombre: 'Mate Cocido',           rubro: 'Tés',        tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Azúcares
    { codigo: cods('AZU', 1),  nombre: 'Azúcar Blanca',         rubro: 'Azúcares',   tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('AZU', 2),  nombre: 'Azúcar Mascabo',        rubro: 'Azúcares',   tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('AZU', 3),  nombre: 'Edulcorante',           rubro: 'Azúcares',   tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    // Lácteos
    { codigo: cods('LAC', 1),  nombre: 'Leche Entera',          rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('LAC', 2),  nombre: 'Leche Descremada',      rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('LAC', 3),  nombre: 'Leche Deslactosada',    rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('LAC', 4),  nombre: 'Leche de Almendras',    rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('LAC', 5),  nombre: 'Crema de Leche',        rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'lt',     unidadUso: 'lt' },
    { codigo: cods('LAC', 6),  nombre: 'Manteca',               rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('LAC', 7),  nombre: 'Queso Crema',           rubro: 'Lácteos',    tipo: 'insumo', unidadCompra: 'kg',     unidadUso: 'kg' },
    // Panadería
    { codigo: cods('PAN', 1),  nombre: 'Medialuna de Manteca',  rubro: 'Panadería',  tipo: 'elaborado',unidadCompra: 'unidad',unidadUso: 'unidad' },
    { codigo: cods('PAN', 2),  nombre: 'Factura Surtida',       rubro: 'Panadería',  tipo: 'elaborado',unidadCompra: 'unidad',unidadUso: 'unidad' },
    { codigo: cods('PAN', 3),  nombre: 'Tostadas',              rubro: 'Panadería',  tipo: 'elaborado',unidadCompra: 'unidad',unidadUso: 'unidad' },
    { codigo: cods('PAN', 4),  nombre: 'Pan Lactal',            rubro: 'Panadería',  tipo: 'insumo',   unidadCompra: 'unidad',unidadUso: 'unidad' },
    { codigo: cods('PAN', 5),  nombre: 'Pan Integral',          rubro: 'Panadería',  tipo: 'insumo',   unidadCompra: 'unidad',unidadUso: 'unidad' },
    // Dulces y condimentos
    { codigo: cods('DUL', 1),  nombre: 'Dulce de Leche',        rubro: 'Condimentos',subrubro: 'Dulces',tipo: 'insumo', unidadCompra: 'kg',unidadUso: 'kg' },
    { codigo: cods('DUL', 2),  nombre: 'Mermelada',             rubro: 'Condimentos',subrubro: 'Dulces',tipo: 'insumo', unidadCompra: 'kg',unidadUso: 'kg' },
    { codigo: cods('DUL', 3),  nombre: 'Miel',                  rubro: 'Condimentos',subrubro: 'Dulces',tipo: 'insumo', unidadCompra: 'kg',unidadUso: 'kg' },
    { codigo: cods('DUL', 4),  nombre: 'Cacao en Polvo',        rubro: 'Condimentos',subrubro: 'Dulces',tipo: 'insumo', unidadCompra: 'kg',unidadUso: 'kg' },
    // Frutas y jugos
    { codigo: cods('FRU', 1),  nombre: 'Naranja (para jugo)',   rubro: 'Frutas',     tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    { codigo: cods('FRU', 2),  nombre: 'Limón',                 rubro: 'Frutas',     tipo: 'crudo',  unidadCompra: 'kg',     unidadUso: 'kg' },
    // Bebidas
    { codigo: cods('BEB', 1),  nombre: 'Agua Mineral 500ml',    rubro: 'Bebidas',    subrubro: 'Aguas',     tipo: 'insumo', unidadCompra: 'unidad', unidadUso: 'unidad' },
    { codigo: cods('BEB', 2),  nombre: 'Jugo Natural Naranja',  rubro: 'Bebidas',    subrubro: 'Jugos',     tipo: 'elaborado',unidadCompra: 'unidad',unidadUso: 'unidad' },
  ],
};

// ============================================================================
// Template VACÍO (default — no precarga nada, como la app histórica)
// ============================================================================
const VACIO: WorkspaceTemplate = {
  id: 'vacio',
  nombre: 'Empezar vacío',
  descripcion: 'Workspace en blanco. Vos cargás tus depósitos y productos desde cero.',
  icono: 'FileText',
  color: '#6B7280',
  depositos: [],
  productos: [],
};

// ============================================================================
// Registry — la lista ordenada de templates disponibles
// ============================================================================
export const TEMPLATES: WorkspaceTemplate[] = [
  KIOSCO,
  RESTAURANTE,
  SUSHI,
  BAR,
  PIZZERIA,
  CAFETERIA,
  VACIO,
];

export function getTemplateById(id: string): WorkspaceTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

// ============================================================================
// applyTemplate — aplica un template a una organización recién creada
// ----------------------------------------------------------------------------
// Debe correrse DESPUÉS de crear la organización, idealmente dentro del mismo
// runWithoutTenant(). Si falla parcialmente no rollbackeamos — los datos
// precargados son "mejor esfuerzo", el user puede borrar lo que le sobre.
// Usa prismaRaw porque estos registros van con organizacionId explícito.
// ============================================================================
export async function applyTemplate(
  organizacionId: number,
  templateId: string
): Promise<{ depositosCreados: number; productosCreados: number }> {
  const tpl = getTemplateById(templateId);
  if (!tpl || tpl.id === 'vacio') {
    return { depositosCreados: 0, productosCreados: 0 };
  }

  // Depósitos — crear uno por uno ignorando duplicados (defensivo)
  let depositosCreados = 0;
  for (const dep of tpl.depositos) {
    try {
      await prismaRaw.deposito.create({
        data: {
          organizacionId,
          codigo: dep.codigo,
          nombre: dep.nombre,
          tipo: dep.tipo,
          activo: true,
        },
      });
      depositosCreados++;
    } catch (err: any) {
      // P2002 = unique constraint violation. Silenciamos para idempotencia.
      if (err?.code !== 'P2002') throw err;
    }
  }

  // Productos — createMany con skipDuplicates para ir rápido
  const productosData = tpl.productos.map((p) => ({
    organizacionId,
    codigo: p.codigo,
    nombre: p.nombre,
    rubro: p.rubro,
    subrubro: p.subrubro ?? null,
    tipo: p.tipo,
    unidadCompra: p.unidadCompra,
    unidadUso: p.unidadUso,
    factorConversion: p.factorConversion ?? 1,
    stockMinimo: p.stockMinimo ?? 0,
    stockIdeal: p.stockIdeal ?? 0,
    activo: true,
  }));

  const resProductos = await prismaRaw.producto.createMany({
    data: productosData,
    skipDuplicates: true,
  });

  return {
    depositosCreados,
    productosCreados: resProductos.count,
  };
}

// ============================================================================
// Lista resumida pública — lo que devuelve GET /api/cuenta/templates.
// Evitamos mandar los arrays completos de productos al frontend (KB de datos
// que el user no necesita para elegir): solo metadata + counts.
// ============================================================================
export function listTemplatesSummary() {
  return TEMPLATES.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion,
    icono: t.icono,
    color: t.color,
    totalDepositos: t.depositos.length,
    totalProductos: t.productos.length,
    // Preview de primeros 6 productos para que el user tenga idea del contenido
    previewProductos: t.productos.slice(0, 6).map((p) => p.nombre),
    // Preview de los rubros cubiertos (único)
    rubros: [...new Set(t.productos.map((p) => p.rubro))],
  }));
}
