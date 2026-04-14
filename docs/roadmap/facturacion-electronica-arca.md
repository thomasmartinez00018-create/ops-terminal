# Roadmap — Facturación Electrónica ARCA (ex-AFIP)

**Estado:** Backlog · prioridad alta · gran diferencial comercial
**Última actualización:** 2026-04-14

---

## Resumen ejecutivo

Integrar emisión de facturas electrónicas directamente desde OPS Terminal contra los webservices oficiales de ARCA. Objetivo: que un restaurante pueda facturar sin salir del sistema, con CAE + QR oficial, 100% legal. Equivalente al feature premium de MaxiRest, Fudo, Tango, Contabilium — pero integrado nativamente con el flujo de stock y costos de OPS Terminal.

Este feature NO requiere acuerdo con ARCA ni con MaxiRest. Los webservices de facturación electrónica son **públicos, gratuitos y documentados**. Cualquier desarrollador puede consumirlos con un certificado digital válido.

## Por qué importa

1. **Diferencial comercial masivo.** Hoy un resto paga $80-120 USD/mes solo por facturación electrónica en sistemas tipo Fudo / Tango Gestión / Bejerman. Si OPS Terminal lo ofrece por $25-50 USD/mes extra sobre su plan base, es imbatible.
2. **Lock-in.** Un cliente que factura con vos hace retención, libro IVA y CAE en tu sistema — migrar a otra herramienta implica perder histórico de comprobantes y rearmar el flujo. Es el feature más "sticky" que se puede agregar.
3. **Consolidación operativa.** El cliente hoy tiene: sistema de stock + sistema de facturación + planilla de costos + ERP contable. OPS Terminal puede absorber los 3 primeros. Ese es el pitch.
4. **MaxiRest no tiene nada propietario acá.** Su integración con ARCA es la misma que puede construir cualquier app — consume WSFEv1 vía SOAP, obtiene CAE, imprime comprobante con QR. Cero moat técnico.

## Stack técnico

### Webservices de ARCA a consumir

| Service | Qué hace | URL homologación | URL producción |
|---|---|---|---|
| **WSAA** | Autenticación. Firmás XML con certificado y recibís Token+Sign (válido 12h) | `wsaahomo.afip.gov.ar/ws/services/LoginCms` | `wsaa.afip.gov.ar/ws/services/LoginCms` |
| **WSFEv1** | Emisión de facturas, NC, ND — devuelve CAE | `wswhomo.afip.gov.ar/wsfev1/service.asmx` | `servicios1.afip.gov.ar/wsfev1/service.asmx` |
| **Padrón A13** | Consulta condición IVA por CUIT (opcional, para autocomplete) | — | — |

### Librería recomendada

[**AfipSDK/afip.js**](https://github.com/AfipSDK/afip.js) — MIT license, 100k+ downloads desde 2017, TypeScript nativo, cubre WSAA + WSFEv1 + Padrón + QR oficial. **Gratuito**. Se enchufa limpio en el backend Node/Express/Prisma actual.

Alternativas: `afipjs`, `ts-afip-ws`, `facturajs`. Similar madurez, misma licencia. AfipSDK es la más usada.

### Tipos de comprobantes a soportar (prioridad)

1. **Factura B** → consumidor final. 99% del uso en restaurantes. **MVP.**
2. **Factura C** → si la org es monotributista. **MVP.**
3. **Factura A** → cuando el cliente pide IVA discriminado (empresas, eventos corporativos). Fase 2.
4. **Notas de crédito A/B/C** → devoluciones y anulaciones. Fase 2.
5. **Ticket fiscal** → NO aplica. Requiere controlador fiscal físico homologado. MaxiRest tampoco lo hace.

## Lo que tiene que hacer el cliente final (onboarding)

Inevitable, pasa en cualquier sistema:

1. Tener CUIT activo y condición IVA definida (RI o Monotributista).
2. Clave fiscal nivel 3 (trámite gratuito online en ARCA, ~15 min).
3. Dar de alta un **Punto de Venta para Webservice** (distinto del de talonario o Talonario Online). Trámite en ARCA, ~5 min.
4. Generar certificado digital en ARCA (clave fiscal → Administración de Certificados Digitales → crear CSR → descargar `.crt`). Válido 2 años.
5. Subir el certificado a OPS Terminal desde la pantalla de **Configuración Fiscal** que hay que construir.

→ Para bajar fricción: pantalla de onboarding con checklist + video tutorial + links directos a los servicios ARCA.

## Lo que hay que construir en OPS Terminal

| Feature | Complejidad | Prioridad |
|---|---|---|
| Pantalla Configuración Fiscal (subir cert, validar contra homologación, guardar punto de venta) | Baja | MVP |
| Tabla `ConfiguracionFiscal` (cert cifrado, punto de venta, ambiente homo/prod) | Baja | MVP |
| Tabla `Comprobante` (tipo, ptoVta, numero, CAE, caeVto, total, cliente, items, qrUrl, pdfUrl, estado, organizacionId) | Baja | MVP |
| Cliente WSFEv1 (wrap de AfipSDK) con retries idempotentes y reserva de número previo al request | Media | MVP |
| Cifrado simétrico de certificados at-rest (master key en Railway env) | Media | MVP |
| Generador PDF del comprobante con QR oficial ARCA + leyenda legal | Baja | MVP |
| UI "Emitir Factura" (desde venta/salida o desde cero) — tipo, cliente, items, emitir, preview PDF | Media | MVP |
| Flag ambiente homologación → producción por organización | Baja | MVP |
| Libro IVA ventas exportable (Excel/PDF) — para entregar al contador | Baja | Fase 2 |
| Consulta Padrón A13 para autocomplete de clientes por CUIT | Baja | Fase 2 |
| Notas de crédito / débito | Media | Fase 2 |
| Reimpresión y envío por email del comprobante al cliente | Baja | Fase 2 |

## Riesgos y consideraciones

1. **CAE es inmutable.** Una vez que ARCA devuelve CAE, la factura existe legalmente. No se borra — se anula con nota de crédito. Nunca persistir un comprobante "emitido" sin CAE confirmado.
2. **Idempotencia.** Si un request a ARCA timeoutea, hay que consultar con `FECompConsultar` si el número ya fue usado antes de reintentar, para no duplicar.
3. **Gestión del certificado.** Cert mal subido → todas las facturas del cliente fallan. Validar en tiempo real al subirlo (request de prueba contra Padrón).
4. **Conservación legal.** Ley argentina obliga a conservar comprobantes emitidos por **10 años**. Backup automático de PDFs + JSON en S3 (o equivalente). Postgres solo no alcanza para durabilidad de 10 años.
5. **RG 5616/2024** (vigente desde abril 2025): más detalle de ítems en algunos casos. AfipSDK ya está actualizado pero verificar.
6. **Responsabilidad legal.** OPS Terminal NO emite las facturas — el contribuyente las emite usando la herramienta. Modelo idéntico al de MaxiRest/Contabilium/Tango. No se necesita licencia especial. Términos del servicio deben aclarar: "OPS Terminal es una herramienta de facilitación; la responsabilidad fiscal es del contribuyente".

## Plan de implementación (5 fases)

### Fase 0 — Setup (2 días)
- Crear cuenta de homologación AFIP (propia, de Tomás o de un cliente piloto)
- Generar certificado de homologación
- Instalar `@afipsdk/afip.js` en backend
- Hello-world: emitir una factura B de prueba contra WSFE homologación y recibir CAE

### Fase 1 — MVP (1 semana)
- Schema Prisma: `ConfiguracionFiscal`, `Comprobante`
- Middleware de cifrado de certificados
- Endpoint `POST /api/configuracion-fiscal` (upload cert + validar)
- Endpoint `POST /api/comprobantes` (emitir factura)
- Endpoint `GET /api/comprobantes` (listado con filtros)
- Cliente WSFEv1 con reintentos idempotentes
- PDF generator con QR oficial
- Frontend: pantalla Configuración Fiscal
- Frontend: modal "Emitir Factura" con selección de tipo + cliente + items

### Fase 2 — Producción (3-4 días)
- Flag ambiente por organización (homo ↔ prod)
- Validación exhaustiva: emitir 20+ comprobantes de prueba de distintos tipos
- Beta con 1 cliente piloto
- Monitoreo de errores ARCA + logging

### Fase 3 — Extras (1 semana)
- Factura A
- Notas de crédito y débito
- Libro IVA ventas exportable
- Consulta Padrón A13 para autocomplete

### Fase 4 — Go-to-market
- Ajuste de pricing (plan premium con facturación: +$25-50 USD/mes)
- Landing / sección específica en la página cara
- Onboarding video tutorial
- Caso de éxito con el cliente piloto

## Modelo de pricing sugerido

| Plan | Features | Precio sugerido (USD/mes) |
|---|---|---|
| **Básico** (actual) | Stock, recetas, compras, reportes | $25-40 |
| **Pro** (nuevo) | Todo lo anterior + facturación electrónica + libro IVA + multi-punto de venta | $60-90 |

Benchmarks:
- Fudo: $80-120 USD/mes con facturación
- Tango Gestión Restó: $150+ USD/mes
- MaxiRest: $100+ USD/mes
- Contabilium: $30-60 USD/mes (solo facturación, sin stock/cocina)

## Referencias

- [Webservices de factura electrónica — ARCA oficial](https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp)
- [Manual desarrollador WSFEv1 ARCA](https://www.afip.gob.ar/fe/documentos/manual-desarrollador-ARCA-COMPG-v4-0.pdf)
- [WSAA — autenticación ARCA](https://www.afip.gob.ar/ws/documentacion/wsaa.asp)
- [AfipSDK/afip.js GitHub](https://github.com/AfipSDK/afip.js)
- [afipjs — alternativa Node.js](https://github.com/egnuez/afipjs)
- [MaxiRest — configuración facturación electrónica](https://ayuda.maxirest.com/que_datos_se_necesitan)
- [MaxiRest — limitaciones con cierre Z fiscal](https://ayuda.maxirest.com/%C2%BFpod%C3%A9s-emitir-un-cierre-z-fiscal-si-utiliz%C3%A1s-fact-electr%C3%B3nica)

## Decisión pendiente

**¿Arrancamos con Fase 0 cuando haya bandwidth?**
- Requiere ~15 min de trámite personal de Tomás (generar certificado de homologación con su CUIT)
- Después, ~2 semanas de desarrollo full-focus para tener MVP en producción

Prioridad: ALTA. Es el feature más rentable del roadmap en términos de retention + willingness-to-pay.
