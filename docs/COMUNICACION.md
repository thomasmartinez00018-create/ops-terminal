# Línea de comunicación — OPS Terminal

> **Regla de oro:** la gente no compra features. Compra resultados y tranquilidad.
> Describimos siempre el beneficio primero, la feature después (si hace falta).

---

## 1. ¿Para quién es OPS Terminal?

### Audiencia primaria (el que compra)
**Dueños y encargados de negocios gastronómicos pequeños y medianos en Argentina.**

- Restaurantes, bares, pizzerías, sushi, panaderías, dark kitchens, cervecerías.
- Facturación mensual: entre 5 y 150 millones ARS.
- Entre 3 y 25 empleados.
- El dueño está metido operativamente (cocina, compra o cierra caja él mismo).
- No es entusiasta de tecnología. Probó 2-3 sistemas antes, todos le parecieron complicados o caros.
- Vive con el margen al filo, la inflación le come y no sabe con certeza cuánto gana por plato.
- Perfil emocional: cansado, suspicaz, valora soluciones concretas, detesta el marketing vacío.

### Audiencia secundaria (el que usa)
**Staff operativo: cocineros, barra, depósito, encargado de compras.**

- No eligen la herramienta, pero si les cuesta usarla, la sabotean.
- Valoran velocidad: escanear un código, registrar un movimiento, pegar una lista de precios.
- No les importan los dashboards. Les importa no frenar el servicio.

### Quién NO es el cliente
- Cadenas grandes (>50 empleados, >200 millones/mes): necesitan ERP serio (Zeus, Bejerman). No somos eso.
- Delivery puro sin depósito (cloud kitchens solo con Pedidos Ya): no es el fit principal aunque puede usarnos.
- Dueños que solo quieren un POS de caja: no vendemos caja. Vendemos control de stock + costos.

---

## 2. Los 5 problemas que resolvemos (en orden de venta)

Cuando describimos la app, SIEMPRE partimos desde el problema. El feature es el medio.

### 2.1. "No sé cuánto me cuesta cada plato"
**El drama:** inflación mensual al 4-8%. El que cobra el mismo precio que hace 3 meses está perdiendo plata y no lo sabe.
**Lo que hacemos:** cargás la receta una vez, la app actualiza el costo automáticamente con cada factura nueva del proveedor. Ves margen real por plato, con método del chef profesional (cantidad neta + merma → cantidad bruta a comprar).
**Sentimiento que resolvemos:** dejar de operar a ciegas. Dormir tranquilo sabiendo que cada plato te deja margen.

### 2.2. "Se me vence mercadería antes de usarla"
**El drama:** tirar comida es tirar plata. Pero acordarte de qué tenés en cada cámara es imposible.
**Lo que hacemos:** alertas de stock bajo/stock a vencer, inventarios rápidos con scanner bluetooth en el celular, control por depósito (cámara, seco, barra).
**Sentimiento:** no volver a abrir la heladera y tirar a la basura lo que compraste hace 2 semanas.

### 2.3. "Me roban o pierdo stock sin explicación"
**El drama:** el stock cierra distinto al conteo real cada mes. Nadie sabe por qué.
**Lo que hacemos:** cada movimiento queda registrado con quién, cuándo y desde qué depósito. Discrepancias claras entre teórico y real al inventariar. El dueño ve patrones.
**Sentimiento:** volver a confiar en tu equipo sabiendo exactamente qué se movió y por qué.

### 2.4. "Pierdo tiempo armando pedidos a proveedores"
**El drama:** buscás precios en WhatsApp, armás la lista en un papel, te olvidás algo, llamás 3 veces.
**Lo que hacemos:** escaneás la factura con la cámara → la IA extrae productos y precios → carga el ingreso solo. Armás órdenes de compra y las mandás por WhatsApp en un click. Comparás precios entre proveedores para saber a quién comprarle cada cosa.
**Sentimiento:** recuperar el tiempo que se te va cargando papeles.

### 2.5. "Los sistemas que probé antes eran un laberinto"
**El drama:** los ERPs grandes son para gigantes. Los simples no sirven para un restaurante. Todos son caros, lentos o ambos.
**Lo que hacemos:** app que se aprende en minutos, corre en el celular del empleado y la compu del dueño, asistente IA que responde desde adentro y sabe exactamente tu negocio. Sin contratos largos.
**Sentimiento:** sentirte en control, no perdido.

---

## 3. Cómo traducimos features a beneficios

La tabla de traducción. NUNCA describas la feature a secas — describí el resultado.

| ❌ Feature como fin | ✅ Beneficio primero, feature como medio |
|---|---|
| "Gestión de stock multi-depósito con Prisma y Postgres" | "Cada cámara, barra o cocina con su propio stock. Sabés exactamente qué hay en cada lugar sin adivinar." |
| "Importador de listas de precio con IA (Gemini)" | "Te llega el PDF del proveedor al WhatsApp. Lo arrastrás, en 30 segundos tenés 300 precios actualizados sin tipear uno." |
| "Sistema de recetas con factor de desperdicio" | "Poné cuánto pesa limpio un ingrediente y cuánto se descarta. La app calcula sola cuánto hay que comprar y cuánto te cuesta el plato." |
| "Multi-tenant con roles granulares" | "Cada empleado ve solo lo que tiene que ver. El cocinero no ve los costos, el encargado sí." |
| "Conversión automática de unidades (kg/g/lt/unidad)" | "Compras por caja, usás por gramo, la app hace la cuenta. Cero errores." |
| "Asistente IA con contexto del workspace" | "Preguntá 'qué hago ahora' y te responde con los próximos 3 pasos exactos para tu negocio, no para uno genérico." |
| "Escaneo de facturas con OCR vía Gemini Vision" | "Sacás una foto de la factura. En 20 segundos están los 15 items cargados. Nunca más tipeaste una factura." |
| "Sistema de reposición encadenada con alertas" | "Cuando la barra se queda sin algo, la app te avisa si podés reponerlo del depósito o hay que comprarlo." |
| "Comparador de precios por proveedor con presentación base" | "Elegís los 10 productos de la semana y ves al toque qué proveedor te sale más barato en total. Un click y mandás el pedido por WhatsApp." |
| "Detección automática de variación de precios" | "Si el aceite te subió 30% en 2 semanas, la app te lo muestra antes de que el mes te agarre desprevenido." |

---

## 4. Tono y vocabulario

### Voz
- **Directo**: "Dejá de perder plata con mercadería vencida" antes que "Optimizá la rotación de inventario".
- **Concreto**: números, minutos, pesos. Nada abstracto.
- **En vos, no en usted**: somos argentinos hablando con argentinos. "Cargás, ves, sabés."
- **Honesto**: si algo es complejo, lo decimos. No prometemos magia, prometemos método.
- **Sin hype tech**: no mencionamos "IA de última generación", "blockchain", "machine learning". Mencionamos lo que hace: "te dice qué comprar".

### Palabras **SÍ**
- Plata, margen, costo, pedido, proveedor, stock, merma, cámara, factura, precio, receta, plato, servicio, cocina, barra, depósito.
- Resultados: "sabés", "ves", "recuperás", "dejás de".
- Tiempos concretos: "en 30 segundos", "un click", "una foto".

### Palabras **NO**
- "Solución", "plataforma", "ecosistema", "integral", "360°", "disruptivo", "revolucionario".
- "Empoderar", "potenciar", "optimizar", "maximizar" (sin decir qué y cuánto).
- "AI-powered", "data-driven", "cloud-native" (nadie los busca en este nicho).
- Anglicismos innecesarios: decir "panel" antes que "dashboard", "informe" antes que "report", "pedido" antes que "order".

### Números que mejor venden
Siempre que podamos, metemos un dato concreto:
- "30 segundos para cargar una factura de 20 items"
- "300 precios actualizados con arrastrar un PDF"
- "Sabés el margen de cada plato en tiempo real"
- "Desde $19 USD al mes" (no "plan accesible")

---

## 5. Estructura del mensaje (landing, emails, ads)

Orden obligatorio:

1. **Headline — el problema del cliente, no lo que hacemos.**
   > ❌ "OPS Terminal: el sistema de gestión gastronómica con IA"
   > ✅ "Sabé cuánto te cuesta cada plato, sin planillas."

2. **Sub — cómo lo resolvemos en 1 línea, con un dato.**
   > "Cargás la receta una vez. Cada factura nueva actualiza el costo sola. En 3 minutos."

3. **CTA primario — verbo + resultado, no "registrate".**
   > ✅ "Probá 14 días gratis" / "Ver cómo funciona" / "Calculá tu margen"
   > ❌ "Sign up" / "Empezar ahora"

4. **Prueba social antes que features.**
   - Testimonios cortos con nombre + tipo de negocio ("Andrés, sushi en Villa Crespo").
   - Números si los tenemos: "+X restaurantes en Argentina usando OPS".

5. **Problemas/beneficios ANTES que features.**
   Una grilla con 4-6 problemas del nicho y cómo los resolvemos. NO una lista de features.

6. **Features solo en una sección profunda, cerca del pricing.**
   Para el que quiere chequear que técnicamente está bien.

7. **Pricing transparente.**
   Precio en pesos y en dólares. Qué incluye cada plan en términos de NEGOCIO ("hasta X facturas/mes"), no técnicos ("hasta X queries").

8. **FAQ que responde objeciones reales.**
   - "¿Mis datos son míos?"
   - "¿Anda si se corta internet?"
   - "¿Qué pasa si dejo de pagar?"
   - "¿Necesito ser técnico?"
   - "¿Mi contador puede acceder?"

9. **Cierre que saca el miedo.**
   > "Sin contratos. Cancelás cuando quieras. Te damos una mano con la importación inicial."

---

## 6. Ejemplos concretos para la landing actual

### Hero — antes vs después

**Antes (actual)**
> OPS Terminal
> El sistema operativo para gestionar stock, costos y proveedores de tu restaurante.

**Después**
> Dejá de adivinar cuánto ganás.
> OPS Terminal calcula el costo real de cada plato, te avisa antes de que se venza la mercadería y arma los pedidos a proveedores por vos.
> Probá 14 días gratis → (CTA)
> Desde $19 USD/mes · Sin contratos · Anda en cualquier celular

### Feature card — antes vs después

**Antes**
> **Recetas**
> Sistema de recetas con ingredientes, merma y rendimiento.

**Después**
> **Sabé el margen real de cada plato**
> Cargás la receta una vez. Cuando cambia el precio del tomate, tu pizza actualiza el costo automáticamente. Nunca más cobraste barato sin darte cuenta.

### Bloque "escáner de facturas" — antes vs después

**Antes**
> Escanea facturas y remitos con la cámara usando IA para extraer items y precios automáticamente.

**Después**
> **Nunca más tipeaste una factura**
> Sacás una foto. En 20 segundos los 15 items están cargados al stock, matcheados con tu catálogo, y el precio actualizado en la lista del proveedor.

---

## 7. Checklist antes de publicar cualquier copy

Antes de que un texto salga (landing, email, ad, caption), preguntate:

- [ ] ¿Menciona el problema del cliente antes que la feature?
- [ ] ¿Usa palabras del mundo del cliente (plata, margen, plato) y no del mundo tech (plataforma, solución)?
- [ ] ¿Tiene un número o dato concreto?
- [ ] ¿El CTA describe un resultado, no una acción técnica?
- [ ] ¿Respeta el tuteo argentino?
- [ ] ¿Cabe en 1 frase si se lo mostrás a tu tía que tiene una parrilla?

Si la respuesta a cualquiera es "no", reescribilo.

---

## 8. Cómo aplicar esto a nuevas features

Cada vez que agregamos algo al producto, antes de anunciarlo escribimos:

1. **Problema del cliente** (1 frase, en sus palabras)
2. **Cómo lo resuelve** (1 frase, con un número si se puede)
3. **Qué siente distinto después** (1 frase, emocional)

Solo después escribimos la documentación técnica. Primero el beneficio, después el cómo.
