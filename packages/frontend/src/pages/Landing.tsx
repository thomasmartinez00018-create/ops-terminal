import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Boxes, ChefHat, Scan, FileText,
  Sparkles, ShoppingCart, LineChart, Warehouse, Download,
  Monitor, Globe,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Landing — la cara pública de OPS Terminal
// ─────────────────────────────────────────────────────────────
// Estética: editorial dark luxury + financial terminal.
// Tipografía mixta: Instrument Serif (display italic) + IBM Plex
// Mono (accents + numbers) + Manrope (body). Grain overlay, gold
// glow radial, asymmetric grid, mock screenshots en CSS puro para
// que no dependa de assets externos.
// ─────────────────────────────────────────────────────────────

// Default pinned URL — fallback si la API de GitHub está rate-limited o
// caída. Apunta al .exe del release actual publicado. Se reemplaza en
// runtime por la URL del release más reciente (ver useEffect abajo).
const DEFAULT_DOWNLOAD_URL =
  'https://github.com/thomasmartinez00018-create/ops-terminal/releases/download/v2.1.2/OPS-Terminal-Setup-2.1.2.exe';
const GITHUB_RELEASES_API =
  'https://api.github.com/repos/thomasmartinez00018-create/ops-terminal/releases/latest';

export default function Landing() {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [downloadUrl, setDownloadUrl] = useState(DEFAULT_DOWNLOAD_URL);
  const [version, setVersion] = useState('v2.1.2');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Al montar: fetch del release más reciente en GitHub y actualizar la
  // URL del botón de descarga. Si falla (rate limit / offline), se queda
  // con el DEFAULT_DOWNLOAD_URL pinneado arriba. Silencioso.
  useEffect(() => {
    fetch(GITHUB_RELEASES_API)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const exeAsset = (data.assets || []).find(
          (a: any) => typeof a.name === 'string' && a.name.endsWith('.exe')
        );
        if (exeAsset?.browser_download_url) {
          setDownloadUrl(exeAsset.browser_download_url);
        }
        if (data.tag_name) setVersion(data.tag_name);
      })
      .catch(() => { /* silencioso: usa el fallback */ });
  }, []);

  const hh = now.toLocaleTimeString('es-AR', { hour12: false });

  return (
    <div className="min-h-screen hero-backdrop grain-overlay text-foreground overflow-x-hidden relative">
      {/* ── NAV ───────────────────────────────────────────────── */}
      <nav className="relative z-20 max-w-[1400px] mx-auto px-6 lg:px-12 py-6 flex items-center justify-between">
        <a href="#top" className="flex items-baseline gap-[2px]">
          <span className="text-primary text-xl font-extrabold tracking-tight">OPS</span>
          <span className="text-foreground text-xl font-extrabold tracking-tight">TERMINAL</span>
          <span className="hidden sm:inline-block ml-2 font-mono-alt text-[10px] text-on-surface-variant uppercase tracking-[0.2em]">· stock gastro</span>
        </a>

        <div className="hidden md:flex items-center gap-8 font-mono-alt text-[11px] uppercase tracking-[0.15em] text-on-surface-variant">
          <a href="#pilares" className="hover:text-primary transition-colors">Pilares</a>
          <a href="#casos" className="hover:text-primary transition-colors">Casos</a>
          <a href="#features" className="hover:text-primary transition-colors">Features</a>
          <a href="#descargar" className="hover:text-primary transition-colors">Descargar</a>
        </div>

        <button
          onClick={() => navigate('/login')}
          className="cta-primary px-5 py-2.5 rounded-md font-bold text-sm flex items-center gap-2"
        >
          Entrar a la app <ArrowUpRight size={15} />
        </button>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <header id="top" className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 pt-10 lg:pt-20 pb-24 lg:pb-32">
        {/* Decorative huge number floating in background */}
        <div className="pointer-events-none absolute -top-10 right-0 lg:right-16 font-display italic text-[18rem] lg:text-[24rem] leading-none text-primary/[0.035] select-none float-slow">
          01
        </div>

        {/* Top bar — terminal-style metadata */}
        <div className="reveal reveal-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-mono-alt uppercase tracking-[0.2em] text-on-surface-variant mb-14">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
            <span>Sistema operativo</span>
          </div>
          <span className="text-border">·</span>
          <span>V {version.replace(/^v/, '')}</span>
          <span className="text-border">·</span>
          <span>BUENOS AIRES / {hh}</span>
          <span className="text-border">·</span>
          <span className="text-primary">BETA PRIVADA</span>
        </div>

        {/* Main headline */}
        <div className="relative grid grid-cols-12 gap-6 lg:gap-10 items-end">
          <div className="col-span-12 lg:col-span-8">
            <div className="reveal reveal-2 font-mono-alt text-[11px] uppercase tracking-[0.25em] text-primary mb-6">
              // Plataforma de gestión gastronómica
            </div>
            <h1 className="reveal reveal-3 font-display text-[clamp(3.2rem,9vw,9rem)] leading-[0.92] text-foreground tracking-tight">
              Tu cocina,<br />
              <span className="italic text-gold-gradient">bajo control.</span>
            </h1>
          </div>

          <div className="col-span-12 lg:col-span-4 reveal reveal-4 pb-4">
            <p className="text-base lg:text-[15px] text-on-surface-variant leading-relaxed font-medium">
              OPS Terminal reemplaza 5 planillas, 3 cuadernos y 2 pizarrones.
              <span className="text-foreground"> Stock, recetas, compras, escandallo de costos y control por scanner</span> — en un solo lugar que corre en el navegador o en tu PC.
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className="reveal reveal-5 mt-16 flex flex-wrap items-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="cta-primary px-7 py-4 rounded-md font-bold text-base flex items-center gap-3"
          >
            <Globe size={18} />
            Usar en la web ahora
            <ArrowUpRight size={18} />
          </button>
          <a
            href={downloadUrl}
            download
            className="cta-ghost px-7 py-4 rounded-md font-bold text-base flex items-center gap-3"
          >
            <Download size={18} />
            Descargar para Windows
          </a>
          <div className="font-mono-alt text-[10px] uppercase tracking-[0.2em] text-on-surface-variant ml-2">
            Instalación en 60 segundos · Sin tarjeta
          </div>
        </div>

        {/* Hero screenshot — dashboard mockup in CSS */}
        <div className="reveal reveal-6 mt-24 lg:mt-32 relative">
          <div className="absolute -top-8 left-0 font-mono-alt text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
            [ Vista en vivo · Dashboard ]
          </div>
          <DashboardMock />
        </div>
      </header>

      {/* ── TICKER STRIP ──────────────────────────────────────── */}
      <section className="relative border-y border-primary/15 bg-surface/40 py-5 overflow-hidden marquee-mask">
        <div className="ticker-track font-mono-alt text-[11px] uppercase tracking-[0.2em] text-on-surface-variant gap-12">
          {[...Array(2)].map((_, dup) => (
            <div key={dup} className="flex items-center gap-12 pr-12">
              {TICKER_ITEMS.map((item, i) => (
                <div key={`${dup}-${i}`} className="flex items-center gap-3 whitespace-nowrap">
                  <span className="text-primary">◆</span>
                  <span className="text-primary font-bold">{item.value}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── PILARES (4 columnas asimétricas) ─────────────────── */}
      <section id="pilares" className="max-w-[1400px] mx-auto px-6 lg:px-12 py-28 lg:py-40 relative">
        <div className="absolute top-32 -left-20 font-display italic text-[14rem] leading-none text-primary/[0.03] select-none pointer-events-none">
          02
        </div>

        <SectionHeader
          kicker="// Cuatro pilares"
          title={<>Todo lo que una cocina<br /><span className="italic text-gold-gradient">profesional necesita.</span></>}
          subtitle="Cada módulo resuelve un problema concreto del operativo diario. Hablan entre sí. No hay silos, planillas sueltas, ni datos duplicados."
        />

        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-primary/10 border border-primary/10">
          {PILARES.map((p, i) => (
            <div key={i} className="group bg-background p-8 lg:p-10 relative overflow-hidden transition-colors hover:bg-surface/60">
              <div className="font-mono-alt text-[10px] text-primary/60 mb-6">0{i + 1}</div>
              <div className="text-primary mb-6 transition-transform group-hover:-translate-y-1">
                <p.icon size={32} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-3xl lg:text-4xl italic leading-[0.95] mb-4 text-foreground">
                {p.title}
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {p.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── EDITORIAL STATEMENT ──────────────────────────────── */}
      <section className="relative py-20 lg:py-32 border-y border-primary/10 bg-surface/30">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 text-center">
          <div className="font-mono-alt text-[10px] uppercase tracking-[0.25em] text-primary mb-8">
            [ manifesto ]
          </div>
          <h2 className="font-display text-[clamp(2.5rem,6vw,6rem)] leading-[0.95] text-foreground italic tracking-tight">
            Una sola herramienta.<br />
            <span className="text-gold-gradient not-italic">Todo tu operativo.</span>
          </h2>
          <p className="mt-10 max-w-2xl mx-auto text-on-surface-variant text-base leading-relaxed">
            Te sacamos las planillas de Excel, los cuadernos con letra ilegible,
            los WhatsApps de la noche pidiendo stock y las llamadas al proveedor
            para pedir la lista de precios actualizada. Todo vive en OPS Terminal.
          </p>
        </div>
      </section>

      {/* ── CASOS DE USO ──────────────────────────────────────── */}
      <section id="casos" className="max-w-[1400px] mx-auto px-6 lg:px-12 py-28 lg:py-40 relative">
        <div className="absolute top-32 right-0 font-display italic text-[14rem] leading-none text-primary/[0.03] select-none pointer-events-none">
          03
        </div>

        <SectionHeader
          kicker="// Casos de uso"
          title={<>Para todos los puestos.<br /><span className="italic text-gold-gradient">De la cocina al contador.</span></>}
          subtitle="OPS Terminal se adapta a cada rol con una UI específica. Roles + permisos + interfaz tuneada. Tu cocinero ve lo que necesita ver. Tu dueño, también."
        />

        <div className="mt-20 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {CASOS.map((c, i) => (
            <div key={i} className="group">
              <div className="mock-window mb-6 transition-transform group-hover:-translate-y-1">
                <div className="mock-chrome px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
                  </div>
                  <div className="flex-1 text-center font-mono-alt text-[9px] text-on-surface-variant tracking-[0.15em] uppercase">
                    {c.chrome}
                  </div>
                </div>
                {c.mock}
              </div>
              <div className="font-mono-alt text-[10px] text-primary tracking-[0.2em] uppercase mb-3">
                0{i + 1} / {c.rol}
              </div>
              <h3 className="font-display italic text-3xl mb-4 text-foreground leading-tight">{c.title}</h3>
              <ul className="space-y-2 text-sm text-on-surface-variant">
                {c.bullets.map((b, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="text-primary shrink-0">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES DETAIL ──────────────────────────────────── */}
      <section id="features" className="max-w-[1400px] mx-auto px-6 lg:px-12 py-28 lg:py-40 relative">
        <div className="absolute top-32 -left-20 font-display italic text-[14rem] leading-none text-primary/[0.03] select-none pointer-events-none">
          04
        </div>

        <SectionHeader
          kicker="// Features destacados"
          title={<>Por qué OPS Terminal<br /><span className="italic text-gold-gradient">no es una planilla más.</span></>}
          subtitle=""
        />

        <div className="mt-24 space-y-32">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className={`grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center ${
                  i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div className="lg:col-span-7">{f.mock}</div>
                <div className="lg:col-span-5">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="text-primary"><Icon size={22} strokeWidth={1.5} /></div>
                    <span className="font-mono-alt text-[10px] text-primary tracking-[0.2em] uppercase">{f.tag}</span>
                  </div>
                  <h3 className="font-display text-5xl lg:text-6xl leading-[0.95] mb-6 tracking-tight">
                    {f.title}
                  </h3>
                  <p className="text-on-surface-variant text-base leading-relaxed mb-6">
                    {f.description}
                  </p>
                  <ul className="space-y-3 text-sm">
                    {f.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="text-primary font-mono-alt text-xs mt-0.5">[{String(j + 1).padStart(2, '0')}]</span>
                        <span className="text-foreground">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── DESCARGAR ─────────────────────────────────────────── */}
      <section id="descargar" className="relative border-y border-primary/15 py-28 lg:py-40 overflow-hidden">
        <div className="absolute inset-0 hero-backdrop opacity-70"></div>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 relative">
          <SectionHeader
            kicker="// Instalación"
            title={<>Dos formas.<br /><span className="italic text-gold-gradient">Misma app.</span></>}
            subtitle="Los datos viven en la nube — podés entrar desde el navegador, desde un launcher de escritorio, o desde el celular del chef. Todos ven lo mismo, en tiempo real."
          />

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative p-10 lg:p-14 mock-window">
              <div className="font-mono-alt text-[10px] text-primary tracking-[0.25em] uppercase mb-8">
                Opción 01 · cero instalación
              </div>
              <div className="text-primary mb-8">
                <Globe size={48} strokeWidth={1.2} />
              </div>
              <h3 className="font-display text-5xl italic leading-[0.95] mb-4">Web</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-10">
                Abrí tu navegador, entrá, y empezá a trabajar. Funciona en cualquier
                dispositivo — PC, Mac, Linux, tablet, celular. Ideal para cocinas
                con muchas terminales o para acceder desde afuera del local.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="cta-primary px-6 py-3.5 rounded-md font-bold text-sm flex items-center gap-2"
              >
                Entrar ahora
                <ArrowUpRight size={16} />
              </button>
              <ul className="mt-10 space-y-2 font-mono-alt text-[11px] text-on-surface-variant">
                <li>→ Funciona en: Chrome, Safari, Firefox, Edge</li>
                <li>→ Compatible con mobile + tablet</li>
                <li>→ Se actualiza sola</li>
              </ul>
            </div>

            <div className="relative p-10 lg:p-14 mock-window">
              <div className="font-mono-alt text-[10px] text-primary tracking-[0.25em] uppercase mb-8">
                Opción 02 · escritorio
              </div>
              <div className="text-primary mb-8">
                <Monitor size={48} strokeWidth={1.2} />
              </div>
              <h3 className="font-display text-5xl italic leading-[0.95] mb-4">Desktop</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-10">
                Un .exe nativo para Windows. Atajo en el escritorio, arranca directo
                en la app, sin barra del navegador. Ideal para la PC fija de la caja,
                la oficina, o el depósito.
              </p>
              <a
                href={downloadUrl}
                download
                className="cta-primary px-6 py-3.5 rounded-md font-bold text-sm inline-flex items-center gap-2"
              >
                <Download size={16} />
                Descargar .exe
              </a>
              <ul className="mt-10 space-y-2 font-mono-alt text-[11px] text-on-surface-variant">
                <li>→ Windows 10 / 11 · 64-bit</li>
                <li>→ Instalador ~80 MB</li>
                <li>→ Auto-update en cada release</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="max-w-[1400px] mx-auto px-6 lg:px-12 py-16 relative">
        <div className="hairline mb-10"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-baseline gap-[2px] mb-3">
              <span className="text-primary text-lg font-extrabold tracking-tight">OPS</span>
              <span className="text-foreground text-lg font-extrabold tracking-tight">TERMINAL</span>
            </div>
            <p className="font-mono-alt text-[10px] text-on-surface-variant uppercase tracking-[0.15em]">
              Stock gastro<br />
              Buenos Aires, Argentina
            </p>
          </div>
          <div>
            <div className="font-mono-alt text-[10px] text-primary uppercase tracking-[0.2em] mb-4">Producto</div>
            <ul className="space-y-2 text-sm text-on-surface-variant">
              <li><a href="#pilares" className="hover:text-primary transition-colors">Pilares</a></li>
              <li><a href="#casos" className="hover:text-primary transition-colors">Casos de uso</a></li>
              <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
              <li><a href="#descargar" className="hover:text-primary transition-colors">Descargar</a></li>
            </ul>
          </div>
          <div>
            <div className="font-mono-alt text-[10px] text-primary uppercase tracking-[0.2em] mb-4">Acceso</div>
            <ul className="space-y-2 text-sm text-on-surface-variant">
              <li><button onClick={() => navigate('/login')} className="hover:text-primary transition-colors">Iniciar sesión</button></li>
              <li><button onClick={() => navigate('/login')} className="hover:text-primary transition-colors">Crear cuenta</button></li>
              <li><a href={downloadUrl} download className="hover:text-primary transition-colors">Descargar desktop</a></li>
            </ul>
          </div>
          <div>
            <div className="font-mono-alt text-[10px] text-primary uppercase tracking-[0.2em] mb-4">Sistema</div>
            <ul className="space-y-2 text-sm text-on-surface-variant">
              <li className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                <span>Todos los servicios operativos</span>
              </li>
              <li className="font-mono-alt text-[11px]">{version} · cloud</li>
            </ul>
          </div>
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 font-mono-alt text-[10px] text-on-surface-variant uppercase tracking-[0.15em]">
          <div>© 2026 · Más Orgánicos · Todos los derechos reservados</div>
          <div>Hecho con ♦ en Buenos Aires</div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section header — reutilizado entre secciones
// ─────────────────────────────────────────────────────────────
function SectionHeader({ kicker, title, subtitle }: { kicker: string; title: React.ReactNode; subtitle: string }) {
  return (
    <div className="grid grid-cols-12 gap-8 items-end">
      <div className="col-span-12 lg:col-span-8">
        <div className="font-mono-alt text-[11px] uppercase tracking-[0.25em] text-primary mb-5">{kicker}</div>
        <h2 className="font-display text-[clamp(2.2rem,5.5vw,5.5rem)] leading-[0.95] tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {subtitle && (
        <div className="col-span-12 lg:col-span-4 pb-4">
          <p className="text-sm text-on-surface-variant leading-relaxed">{subtitle}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Content data
// ─────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  { value: '30+', label: 'features integrados' },
  { value: 'Multi', label: 'depósitos y locales' },
  { value: 'AI', label: 'integrada (Gemini)' },
  { value: '5', label: 'roles con UI propia' },
  { value: '∞', label: 'productos y recetas' },
  { value: 'Real-time', label: 'entre dispositivos' },
  { value: '0', label: 'instalación en web' },
  { value: '.exe', label: 'nativo para Windows' },
];

const PILARES = [
  {
    icon: Boxes,
    title: <>Stock en<br />tiempo real</>,
    text: 'Cada movimiento, uso, merma y compra se refleja al instante. Multi-depósito. Alertas de mínimos. Auditoría completa.',
  },
  {
    icon: ChefHat,
    title: <>Recetas &<br />costos</>,
    text: 'Cargá tus recetas una sola vez. Cambiá el precio de un ingrediente y todo el escandallo se recalcula. Sabés qué te sale cada plato, en tiempo real.',
  },
  {
    icon: ShoppingCart,
    title: <>Compras<br />inteligentes</>,
    text: 'Comparador de precios entre proveedores. Órdenes de compra directas. Escaneo de facturas con IA. Cuentas por pagar.',
  },
  {
    icon: Scan,
    title: <>Control<br />con scanner</>,
    text: 'Conteo físico escaneando códigos de barras. Discrepancias automáticas contra el teórico. Inventario cerrado en minutos, no horas.',
  },
];

const CASOS = [
  {
    rol: 'Cocinero',
    chrome: 'cocina · tablet · elaboraciones',
    title: <>La cocina, sin planillas.</>,
    mock: <CocinaMock />,
    bullets: [
      'Registra elaboraciones desde una tablet o celular',
      'UI pensada para manos ocupadas y dedos mojados',
      'Ve el stock de insumos sin pedir permiso',
      'Mermas y bajas con 2 toques',
    ],
  },
  {
    rol: 'Depósito',
    chrome: 'depósito · pc · movimientos',
    title: <>Entradas y salidas, sin ruido.</>,
    mock: <DepositoMock />,
    bullets: [
      'Scanner conectado → conteo instantáneo',
      'Recepción de mercadería contra orden de compra',
      'Traspasos entre depósitos con un click',
      'Auditoría completa de quién movió qué',
    ],
  },
  {
    rol: 'Dueño / Admin',
    chrome: 'oficina · desktop · dashboard',
    title: <>El operativo, en una pantalla.</>,
    mock: <DashboardMiniMock />,
    bullets: [
      'Dashboard con todos los KPIs críticos',
      'Ranking de platos más rentables',
      'Alertas en tiempo real (stock, vencimientos, tareas)',
      'Exportable a Excel para tu contador',
    ],
  },
];

const FEATURES = [
  {
    icon: LineChart,
    tag: 'costos · escandallo',
    title: <>Sabé cuánto te sale <span className="italic text-gold-gradient">cada plato.</span></>,
    description: 'Cargás tus recetas una sola vez. Cada vez que sube un ingrediente — una lechuga, un kilo de carne, un litro de aceite — el sistema recalcula automáticamente el costo de cada plato que lo usa. Y te avisa si tu margen cayó debajo del objetivo.',
    bullets: [
      'Escandallo automático por plato y por combo',
      'Histórico de costos mes a mes',
      'Alertas cuando el margen baja del objetivo',
      'Reportes exportables para el contador',
    ],
    mock: <CostosMock />,
  },
  {
    icon: Sparkles,
    tag: 'IA · automatización',
    title: <>Dejá que la IA<br /><span className="italic text-gold-gradient">lea tus facturas.</span></>,
    description: 'Sacás una foto a la factura del proveedor, la subís, y Gemini te extrae cada ítem, precio, cantidad y total automáticamente. Después hace el matcheo contra tus productos existentes. Vos solo revisás y confirmás.',
    bullets: [
      'Lectura de facturas y remitos en segundos',
      'Matcheo automático contra tu catálogo',
      'Importación de listas de precio en PDF/Excel',
      'Equivalencias inteligentes entre proveedores',
    ],
    mock: <IAMock />,
  },
  {
    icon: Warehouse,
    tag: 'multi-local · multi-depósito',
    title: <>Un local, cinco locales,<br /><span className="italic text-gold-gradient">mismo sistema.</span></>,
    description: 'OPS Terminal es multi-tenant desde el primer día. Cada local tiene sus propios depósitos, usuarios, recetas y reportes — pero vos, como dueño, podés ver la consolidación de todos al mismo tiempo.',
    bullets: [
      'Multi-depósito dentro de un mismo local',
      'Multi-local dentro de una misma organización',
      'Roles granulares (admin, cocina, depósito, compras)',
      'Datos aislados por tenant, consolidables por dueño',
    ],
    mock: <MultiLocalMock />,
  },
];

// ─────────────────────────────────────────────────────────────
// CSS screenshot mocks — zero external assets
// ─────────────────────────────────────────────────────────────

function DashboardMock() {
  return (
    <div className="mock-window">
      <div className="mock-chrome px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/70"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]/70"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#4ade80]/70"></div>
        </div>
        <div className="flex-1 text-center font-mono-alt text-[10px] text-on-surface-variant tracking-[0.15em] uppercase">
          ops terminal · dashboard
        </div>
      </div>
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden sm:block w-44 border-r border-border/50 p-4 bg-[#0c0c0c]">
          <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em] mb-4">Operaciones</div>
          {['Dashboard', 'Movimientos', 'Stock', 'Órdenes', 'Tareas'].map((x, i) => (
            <div
              key={x}
              className={`text-[11px] py-2 px-2 rounded flex items-center gap-2 ${
                i === 0 ? 'bg-primary/10 text-primary font-bold' : 'text-on-surface-variant'
              }`}
            >
              <span className="w-1 h-1 rounded-full bg-current"></span>{x}
            </div>
          ))}
          <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em] mb-4 mt-6">Compras</div>
          {['Proveedores', 'Facturas', 'Listas'].map((x) => (
            <div key={x} className="text-[11px] py-2 px-2 rounded flex items-center gap-2 text-on-surface-variant">
              <span className="w-1 h-1 rounded-full bg-current"></span>{x}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-5 lg:p-7 bg-background">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em]">Operaciones · Dashboard</div>
              <div className="font-display italic text-2xl lg:text-3xl mt-0.5 text-foreground">Buenas, Andy.</div>
            </div>
            <div className="hidden sm:flex gap-2 font-mono-alt text-[9px] text-on-surface-variant">
              <span className="px-2 py-1 rounded border border-border">HOY</span>
              <span className="px-2 py-1 rounded border border-border">SEMANA</span>
              <span className="px-2 py-1 rounded border border-primary text-primary">MES</span>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { l: 'Valor stock', v: '$ 1.847k', d: '+12%', up: true },
              { l: 'Productos activos', v: '324', d: '+8', up: true },
              { l: 'Movimientos / día', v: '47', d: '—', up: null },
              { l: 'Alertas', v: '3', d: 'revisar', up: false },
            ].map((k, i) => (
              <div key={i} className="glass rounded-lg p-3 lg:p-4">
                <div className="font-mono-alt text-[9px] uppercase text-on-surface-variant tracking-[0.15em] mb-2">{k.l}</div>
                <div className="text-xl lg:text-2xl font-extrabold text-foreground">{k.v}</div>
                <div className={`text-[10px] font-bold mt-1 ${k.up === true ? 'text-success' : k.up === false ? 'text-destructive' : 'text-on-surface-variant'}`}>
                  {k.d}
                </div>
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div className="glass rounded-lg p-4 lg:p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono-alt text-[10px] uppercase text-primary tracking-[0.2em]">Valor de stock — últimos 30 días</div>
              <div className="font-mono-alt text-[10px] text-on-surface-variant">$ 1.847.230</div>
            </div>
            <svg viewBox="0 0 400 80" className="w-full h-16">
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,55 L30,48 L60,52 L90,40 L120,44 L150,30 L180,38 L210,22 L240,26 L270,18 L300,22 L330,12 L360,18 L400,8 L400,80 L0,80 Z"
                fill="url(#g1)"
              />
              <path
                d="M0,55 L30,48 L60,52 L90,40 L120,44 L150,30 L180,38 L210,22 L240,26 L270,18 L300,22 L330,12 L360,18 L400,8"
                fill="none"
                stroke="#D4AF37"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* Table preview */}
          <div className="glass rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-mono-alt text-[10px] uppercase text-primary tracking-[0.2em]">
              Últimos movimientos
            </div>
            <div className="divide-y divide-border">
              {[
                { t: 'Entrada', p: 'Tomate cherry · 5kg', d: 'Verdulería Mendoza', c: 'text-success' },
                { t: 'Uso', p: 'Aceite oliva · 250ml', d: 'Elaboración milanesa', c: 'text-foreground' },
                { t: 'Merma', p: 'Lechuga · 800g', d: 'Vencida', c: 'text-destructive' },
              ].map((r, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className={`font-mono-alt font-bold uppercase ${r.c}`}>{r.t}</span>
                    <span className="text-foreground">{r.p}</span>
                  </div>
                  <span className="text-on-surface-variant hidden sm:inline">{r.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CocinaMock() {
  return (
    <div className="bg-background p-5">
      <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em] mb-1">Cocina · Elaborar</div>
      <div className="font-display italic text-xl text-foreground mb-4">Milanesas napolitanas</div>
      <div className="space-y-2">
        {[
          { ing: 'Nalga', qty: '1.8 kg', ok: true },
          { ing: 'Pan rallado', qty: '600 g', ok: true },
          { ing: 'Huevo', qty: '12 un', ok: true },
          { ing: 'Mozzarella', qty: '800 g', ok: false },
        ].map((r, i) => (
          <div key={i} className="glass rounded-md p-2.5 flex items-center justify-between text-[11px]">
            <span className="text-foreground font-semibold">{r.ing}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono-alt text-on-surface-variant">{r.qty}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-success' : 'bg-warning'}`}></span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 cta-primary rounded-md py-2.5 text-center font-bold text-xs">Producir 15 porciones</div>
    </div>
  );
}

function DepositoMock() {
  return (
    <div className="bg-background p-5">
      <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em] mb-1">Depósito · Scanner</div>
      <div className="font-display italic text-xl text-foreground mb-4">Control por scanner</div>
      <div className="glass rounded-md p-3 mb-3 flex items-center gap-3">
        <div className="text-primary"><Scan size={20} /></div>
        <div className="font-mono-alt text-[11px] text-primary flex-1 border-b border-primary/30 pb-1">
          780129384756|
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { l: 'Prod.', v: '24', c: 'text-foreground' },
          { l: 'OK', v: '21', c: 'text-success' },
          { l: 'Faltan', v: '2', c: 'text-destructive' },
          { l: 'Sobran', v: '1', c: 'text-warning' },
        ].map((k, i) => (
          <div key={i} className="glass rounded p-2 text-center">
            <div className={`text-lg font-extrabold ${k.c}`}>{k.v}</div>
            <div className="font-mono-alt text-[8px] uppercase text-on-surface-variant">{k.l}</div>
          </div>
        ))}
      </div>
      <div className="glass rounded-md divide-y divide-border">
        {[
          { p: 'Coca 500ml', t: 18, c: 18 },
          { p: 'Agua mineral', t: 6, c: 8 },
          { p: 'Pan lactal', t: 12, c: 10 },
        ].map((r, i) => (
          <div key={i} className="px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-foreground">{r.p}</span>
            <span className={`font-mono-alt font-bold ${r.c === r.t ? 'text-success' : r.c < r.t ? 'text-destructive' : 'text-warning'}`}>
              {r.c}/{r.t}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardMiniMock() {
  return (
    <div className="bg-background p-5">
      <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em] mb-1">Admin · Dashboard</div>
      <div className="font-display italic text-xl text-foreground mb-4">Performance mensual</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { l: 'Facturación', v: '$ 4.2M', c: 'text-success' },
          { l: 'Costo prod.', v: '$ 1.6M', c: 'text-foreground' },
          { l: 'Margen bruto', v: '62%', c: 'text-primary' },
          { l: 'Mermas', v: '2.3%', c: 'text-warning' },
        ].map((k, i) => (
          <div key={i} className="glass rounded p-2.5">
            <div className="font-mono-alt text-[8px] uppercase text-on-surface-variant">{k.l}</div>
            <div className={`text-base font-extrabold ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="glass rounded p-3">
        <div className="font-mono-alt text-[9px] uppercase text-primary mb-2">Top platos</div>
        {['Milanesa nap.', 'Bife chorizo', 'Ravioles pesto'].map((p, i) => (
          <div key={i} className="flex items-center justify-between text-[10px] py-1">
            <span className="text-foreground">{p}</span>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${90 - i * 20}%` }}></div>
              </div>
              <span className="font-mono-alt text-on-surface-variant">{90 - i * 20}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostosMock() {
  return (
    <div className="mock-window p-5 lg:p-8">
      <div className="mock-chrome px-4 py-2 flex items-center gap-2 -mx-5 -mt-5 mb-6 lg:-mx-8 lg:-mt-8">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
        </div>
        <div className="flex-1 text-center font-mono-alt text-[9px] text-on-surface-variant tracking-[0.15em] uppercase">
          recetas · escandallo
        </div>
      </div>
      <div className="font-mono-alt text-[10px] uppercase text-primary tracking-[0.2em]">Receta · milanesa napolitana</div>
      <div className="font-display italic text-3xl mt-1 mb-6">Costo por porción</div>
      <div className="space-y-3 mb-6">
        {[
          { i: 'Nalga', q: '180g', p: '$ 1.620', pct: 48 },
          { i: 'Mozzarella', q: '80g', p: '$ 560', pct: 17 },
          { i: 'Pan rallado', q: '60g', p: '$ 180', pct: 5 },
          { i: 'Huevo + otros', q: '—', p: '$ 1.012', pct: 30 },
        ].map((r, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-foreground">{r.i}<span className="text-on-surface-variant ml-2">{r.q}</span></span>
              <span className="font-mono-alt text-foreground">{r.p}</span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${r.pct}%` }}></div>
            </div>
          </div>
        ))}
      </div>
      <div className="hairline mb-4"></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded p-3">
          <div className="font-mono-alt text-[9px] uppercase text-on-surface-variant">Costo total</div>
          <div className="text-lg font-extrabold text-foreground">$ 3.372</div>
        </div>
        <div className="glass rounded p-3">
          <div className="font-mono-alt text-[9px] uppercase text-on-surface-variant">Precio venta</div>
          <div className="text-lg font-extrabold text-foreground">$ 8.900</div>
        </div>
        <div className="glass rounded p-3">
          <div className="font-mono-alt text-[9px] uppercase text-primary">Margen</div>
          <div className="text-lg font-extrabold text-success">62%</div>
        </div>
      </div>
    </div>
  );
}

function IAMock() {
  return (
    <div className="mock-window p-5 lg:p-8">
      <div className="mock-chrome px-4 py-2 flex items-center gap-2 -mx-5 -mt-5 mb-6 lg:-mx-8 lg:-mt-8">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
        </div>
        <div className="flex-1 text-center font-mono-alt text-[9px] text-on-surface-variant tracking-[0.15em] uppercase">
          compras · escanear factura
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Fake receipt */}
        <div className="bg-[#f5f5f0] text-[#111] rounded-md p-4 font-mono-alt text-[10px] space-y-1 transform -rotate-1 shadow-xl">
          <div className="text-center font-bold text-xs mb-2">FRUTIHORT. MENDOZA</div>
          <div className="border-t border-b border-[#111]/30 py-1 mb-1">REMITO Nº 00042381</div>
          <div>TOMATE CHERRY    5.0 KG  $ 8.400</div>
          <div>LECHUGA MANTECOSA 3.0 U  $ 1.200</div>
          <div>ZANAHORIA         4.0 KG  $ 2.800</div>
          <div>PAPA BLANCA      10.0 KG  $ 5.500</div>
          <div>CEBOLLA MORADA    3.0 KG  $ 2.100</div>
          <div className="border-t border-[#111]/30 pt-1 mt-1 font-bold">TOTAL             $ 20.000</div>
        </div>
        {/* Extracted data */}
        <div>
          <div className="font-mono-alt text-[9px] uppercase text-primary tracking-[0.2em] mb-2 flex items-center gap-2">
            <Sparkles size={10} /> EXTRAÍDO POR IA
          </div>
          <div className="glass rounded-md divide-y divide-border">
            {[
              { p: 'Tomate cherry', m: 'ok', q: '5kg', t: '$8.400' },
              { p: 'Lechuga mantecosa', m: 'ok', q: '3un', t: '$1.200' },
              { p: 'Zanahoria', m: 'ok', q: '4kg', t: '$2.800' },
              { p: 'Papa blanca', m: 'ok', q: '10kg', t: '$5.500' },
              { p: 'Cebolla morada', m: 'new', q: '3kg', t: '$2.100' },
            ].map((r, i) => (
              <div key={i} className="p-2.5 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.m === 'ok' ? 'bg-success' : 'bg-warning'}`}></span>
                  <span className="text-foreground">{r.p}</span>
                  {r.m === 'new' && <span className="font-mono-alt text-[8px] uppercase text-warning">nuevo</span>}
                </div>
                <span className="font-mono-alt text-foreground">{r.t}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 font-mono-alt text-[10px] text-on-surface-variant">
            <span className="text-success">✓</span> Total verificado · $ 20.000
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiLocalMock() {
  return (
    <div className="mock-window p-5 lg:p-8">
      <div className="mock-chrome px-4 py-2 flex items-center gap-2 -mx-5 -mt-5 mb-6 lg:-mx-8 lg:-mt-8">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]"></div>
        </div>
        <div className="flex-1 text-center font-mono-alt text-[9px] text-on-surface-variant tracking-[0.15em] uppercase">
          organización · workspaces
        </div>
      </div>
      <div className="font-mono-alt text-[10px] uppercase text-primary tracking-[0.2em]">Seleccioná tu local</div>
      <div className="font-display italic text-3xl mt-1 mb-6">4 workspaces activos</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { n: 'La Parrilla de Andy · Villa Urquiza', r: 'Activo', c: 'text-success', icon: '★' },
          { n: 'La Parrilla de Andy · Palermo', r: 'Activo', c: 'text-success', icon: '◆' },
          { n: 'La Parrilla de Andy · San Isidro', r: 'Activo', c: 'text-success', icon: '▲' },
          { n: 'Depósito central', r: 'Sólo stock', c: 'text-primary', icon: '■' },
        ].map((w, i) => (
          <div key={i} className="glass rounded-lg p-4 flex items-center gap-3 card-glow cursor-pointer">
            <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center text-base font-bold">
              {w.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-foreground truncate">{w.n}</div>
              <div className={`font-mono-alt text-[9px] uppercase tracking-[0.15em] ${w.c}`}>{w.r}</div>
            </div>
            <div className="text-primary"><ArrowUpRight size={14} /></div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2 text-[10px] font-mono-alt text-on-surface-variant">
        <FileText size={11} />
        <span>Cada workspace tiene datos aislados · auditable por admin</span>
      </div>
    </div>
  );
}
