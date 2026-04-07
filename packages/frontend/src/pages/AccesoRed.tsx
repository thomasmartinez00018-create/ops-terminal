import { useEffect, useState } from 'react';
import { Wifi, Copy, Check, Smartphone, Monitor, RefreshCw, AlertTriangle, Shield } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface NetworkIface {
  ip: string;
  name: string;
  netmask: string;
  subnet: string;
}

export default function AccesoRed() {
  const [networkUrl, setNetworkUrl] = useState<string | null>(null);
  const [allUrls, setAllUrls] = useState<string[]>([]);
  const [interfaces, setInterfaces] = useState<NetworkIface[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUrl = () => {
    setLoading(true);
    fetch('/api/network-url')
      .then(r => r.json())
      .then(d => {
        setNetworkUrl(d.url);
        setAllUrls(d.allUrls ?? []);
        setInterfaces(d.interfaces ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUrl(); }, []);

  const copy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  };

  // Detectar si hay posible problema de subred (no hay ninguna 192.168.x.x)
  const has192 = interfaces.some(i => i.ip.startsWith('192.168.'));
  const onlyCable = interfaces.length > 0 && !has192;
  // Múltiples subredes detectadas
  const subnets = [...new Set(interfaces.map(i => i.subnet))];
  const multiSubnet = subnets.length > 1;

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Red local</p>
          <h1 className="text-2xl font-extrabold text-foreground mt-1">Acceso desde celular</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Compartí el link o QR con tu equipo
          </p>
        </div>
        <button
          onClick={fetchUrl}
          className="p-2 rounded-xl bg-surface-high border border-border text-on-surface-variant hover:text-foreground transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <div className="glass rounded-2xl p-8 text-center border border-border">
          <p className="text-on-surface-variant text-sm">Detectando IP de red...</p>
        </div>
      )}

      {!loading && !networkUrl && (
        <div className="glass rounded-2xl p-8 text-center border border-border space-y-3">
          <Wifi size={32} className="mx-auto text-on-surface-variant opacity-40" />
          <p className="font-semibold text-foreground">Sin conexión de red detectada</p>
          <p className="text-sm text-on-surface-variant">
            Conectá la PC a una red (WiFi o cable al router) para que aparezca el link de acceso.
          </p>
          <button
            onClick={fetchUrl}
            className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            Volver a intentar
          </button>
        </div>
      )}

      {!loading && networkUrl && (
        <div className="space-y-6">

          {/* Alerta: solo cable directo, sin IP de router WiFi */}
          {onlyCable && (
            <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/5 p-4 flex gap-3">
              <AlertTriangle size={20} className="text-yellow-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">Esta PC no tiene IP de WiFi del router</p>
                <p className="text-xs text-on-surface-variant">
                  La conexión es por cable directo al modem. Para que los celulares puedan conectarse,
                  la PC necesita estar en la <strong>misma red</strong> que el WiFi.
                </p>
                <p className="text-xs text-on-surface-variant">
                  <strong>Solución:</strong> Conectá el cable de red al <strong>router WiFi</strong> (no al modem directo).
                  Si ya está así, probá cada link de abajo desde el celular.
                </p>
              </div>
            </div>
          )}

          {/* Alerta: múltiples subredes */}
          {multiSubnet && !onlyCable && (
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 flex gap-3">
              <Shield size={20} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Múltiples redes detectadas</p>
                <p className="text-xs text-on-surface-variant">
                  Esta PC tiene conexiones en {subnets.length} subredes distintas ({subnets.map(s => s + '.x').join(', ')}).
                  Usá la IP que esté en la misma subred que el WiFi del celular.
                </p>
              </div>
            </div>
          )}

          {/* Nota firewall */}
          <div className="rounded-2xl border border-border bg-surface-high/50 p-3 flex gap-2.5 items-start">
            <Shield size={14} className="text-on-surface-variant shrink-0 mt-0.5" />
            <p className="text-[11px] text-on-surface-variant">
              Si el celular no carga, puede ser el <strong>Firewall de Windows</strong> bloqueando la conexión.
              Al instalar OPS Terminal se agrega la regla automáticamente, pero si no funciona:
              Panel de Control → Firewall → Permitir app → OPS Terminal.
            </p>
          </div>

          {/* QR grande centrado */}
          <div className="glass rounded-2xl border border-primary/30 p-6 flex flex-col items-center gap-4">
            <div className="bg-white rounded-2xl p-3 shadow-lg">
              <QRCodeSVG
                value={networkUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                className="rounded-xl"
              />
            </div>
            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1">Escaneá con la cámara del celu</p>
              <p className="text-xs font-bold text-primary uppercase tracking-widest">Sin instalar nada</p>
            </div>
          </div>

          {/* URLs copiables */}
          <div className="glass rounded-2xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">
              O copiá el link manualmente
            </p>

            {allUrls.map((url, i) => {
              const iface = interfaces[i];
              const ip = iface?.ip ?? url.replace(/^https?:\/\//, '').split(':')[0];
              const isWifi = ip.startsWith('192.168.');
              const label = i === 0
                ? 'recomendado'
                : isWifi ? 'WiFi' : 'cable';
              return (
                <div key={url} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-surface rounded-xl px-3 py-2.5 border border-border font-mono text-sm text-foreground truncate">
                      {url}
                      <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        i === 0 ? 'text-primary bg-primary/10' : 'text-on-surface-variant bg-surface-high'
                      }`}>
                        {label}
                      </span>
                    </div>
                    <button
                      onClick={() => copy(url)}
                      className="shrink-0 p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                    >
                      {copiedUrl === url ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                    </button>
                  </div>
                  {iface && (
                    <p className="text-[10px] text-on-surface-variant/50 pl-3">
                      {iface.name} — subred {iface.subnet}.x
                    </p>
                  )}
                </div>
              );
            })}

            {copiedUrl && (
              <p className="text-xs text-success font-semibold text-center">✓ Link copiado al portapapeles</p>
            )}
          </div>

          {/* Instrucciones */}
          <div className="glass rounded-2xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Cómo conectarse</p>
            <div className="space-y-2">
              {[
                { icon: Wifi, text: 'Conectá el celu al WiFi del mismo router donde está esta PC' },
                { icon: Smartphone, text: 'Escaneá el QR o abrí el link en el navegador' },
                { icon: Monitor, text: 'Ingresá con tu usuario y contraseña de OPS Terminal' },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon size={13} className="text-on-surface-variant shrink-0" />
                    <p className="text-sm text-on-surface-variant">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Troubleshoot */}
          <details className="glass rounded-2xl border border-border">
            <summary className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-widest cursor-pointer hover:text-foreground transition-colors">
              No funciona? Diagnóstico
            </summary>
            <div className="px-4 pb-4 space-y-3 text-xs text-on-surface-variant">
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Interfaces detectadas:</p>
                {interfaces.map((iface, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 border border-border font-mono">
                    <span className={iface.ip.startsWith('192.168.') ? 'text-success' : 'text-on-surface-variant'}>
                      {iface.ip}
                    </span>
                    <span className="text-on-surface-variant/40">|</span>
                    <span>{iface.name}</span>
                    <span className="text-on-surface-variant/40">|</span>
                    <span>máscara {iface.netmask}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Si no carga desde el celu:</p>
                <ol className="list-decimal list-inside space-y-1 text-on-surface-variant">
                  <li>Verificá que el celu esté en el WiFi del mismo router (no datos móviles)</li>
                  <li>Revisá que Windows Firewall permita OPS Terminal</li>
                  <li>Si la PC solo tiene cable al modem ISP sin router, los celulares no pueden llegar — conectá un router WiFi</li>
                  <li>Probá cada link de arriba — alguno puede funcionar según la configuración de red</li>
                </ol>
              </div>
            </div>
          </details>

        </div>
      )}
    </div>
  );
}
