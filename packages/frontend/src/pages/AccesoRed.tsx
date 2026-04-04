import { useEffect, useState } from 'react';
import { Wifi, Copy, Check, Smartphone, Monitor, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function AccesoRed() {
  const [networkUrl, setNetworkUrl] = useState<string | null>(null);
  const [allUrls, setAllUrls] = useState<string[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUrl = () => {
    setLoading(true);
    fetch('/api/network-url')
      .then(r => r.json())
      .then(d => {
        setNetworkUrl(d.url);
        setAllUrls(d.allUrls ?? []);
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
          <p className="font-semibold text-foreground">Sin conexión WiFi detectada</p>
          <p className="text-sm text-on-surface-variant">
            Conectá la PC a una red WiFi para que aparezca el link de acceso.
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

            {allUrls.map((url, i) => (
              <div key={url} className="flex items-center gap-2">
                <div className="flex-1 bg-surface rounded-xl px-3 py-2.5 border border-border font-mono text-sm text-foreground truncate">
                  {url}
                  {i === 0 && (
                    <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      principal
                    </span>
                  )}
                </div>
                <button
                  onClick={() => copy(url)}
                  className="shrink-0 p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                >
                  {copiedUrl === url ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>
            ))}

            {copiedUrl && (
              <p className="text-xs text-success font-semibold text-center">✓ Link copiado al portapapeles</p>
            )}
          </div>

          {/* Instrucciones */}
          <div className="glass rounded-2xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Cómo conectarse</p>
            <div className="space-y-2">
              {[
                { icon: Wifi, text: 'Conectá el celu a la misma WiFi que esta PC' },
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

        </div>
      )}
    </div>
  );
}
