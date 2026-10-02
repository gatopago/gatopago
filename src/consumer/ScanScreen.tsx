'use client';

import { useEffect, useRef, useState } from 'react';
import { BackHeader, Field, Panel } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { parseConsumerQr, qrReviewPath, type QrDestination } from './qr';
import { localizedPath } from './routes';

export default function ScanScreen({ english: en }: { english: boolean }) {
  const [text, setText] = useState(''), [result, setResult] = useState<QrDestination | null>(null);
  const [error, setError] = useState(''), [camera, setCamera] = useState(false), [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) { stop(); setCamera(false); setBusy(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  function parse(raw: string) {
    const parsed = parseConsumerQr(raw, window.location.origin);
    setResult(parsed); setError(parsed ? '' : en ? 'Unsupported QR. Use a GatoPago /@username profile or an EVM address.' : 'QR no compatible. Usa un perfil /@usuario de GatoPago o una dirección EVM.');
    return !!parsed;
  }
  async function decode(source: CanvasImageSource, width: number, height: number, max: number) {
    if (!width || !height || width * height > 40_000_000) throw new Error('Image too large');
    const scale = Math.min(1, max / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas unavailable');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import('jsqr');
    return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
  }
  async function start() {
    stop(); const current = generation.current; setBusy(true); setError(''); setResult(null);
    timer.current = setTimeout(() => { if (current === generation.current) { stop(); setBusy(false); setCamera(false); setError(en ? 'Camera permission timed out. Try again.' : 'La autorización de cámara tardó demasiado. Reintenta.'); } }, 15000);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (generation.current !== current) { media.getTracks().forEach(track => track.stop()); return; }
      if (timer.current) clearTimeout(timer.current);
      stream.current = media; if (!video.current) throw new Error('Video unavailable');
      video.current.srcObject = media; await video.current.play();
      if (generation.current !== current) return;
      setCamera(true); setBusy(false);
      const scan = async () => {
        if (generation.current !== current || !video.current) return;
        try {
          if (video.current.readyState >= 2) {
            const raw = await decode(video.current, video.current.videoWidth, video.current.videoHeight, 640);
            if (generation.current !== current) return;
            if (raw && parse(raw)) { stop(); setCamera(false); return; }
          }
        } catch { /* Keep manual/image entry available if this frame cannot decode. */ }
        if (generation.current === current) timer.current = setTimeout(() => void scan(), 180);
      };
      void scan();
    } catch {
      if (generation.current === current) { stop(); setBusy(false); setCamera(false); setError(en ? 'Camera unavailable. Check permissions, choose a photo or paste the address.' : 'Cámara no disponible. Revisa permisos, elige una foto o pega la dirección.'); }
    }
  }
  async function image(file?: File) {
    if (!file) return;
    stop(); const current = generation.current; setCamera(false); setBusy(true); setResult(null); setError('');
    let bitmap: ImageBitmap | undefined;
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Unsupported image');
      bitmap = await createImageBitmap(file);
      if (generation.current !== current) return;
      const raw = await decode(bitmap, bitmap.width, bitmap.height, 1600);
      if (generation.current !== current) return;
      if (!raw) throw new Error('No QR');
      parse(raw);
    } catch { if (generation.current === current) setError(en ? 'Could not read the QR. Use a PNG, JPEG or WebP smaller than 10 MB.' : 'No se pudo leer el QR. Usa PNG, JPEG o WebP de menos de 10 MB.'); }
    finally { bitmap?.close(); if (generation.current === current) setBusy(false); }
  }
  return <><BackHeader title={en ? 'Scan QR' : 'Escanear QR'} english={en} />
    <Panel><video ref={video} muted playsInline aria-label={en ? 'Camera preview' : 'Vista de cámara'} className={`${camera ? 'block' : 'hidden'} mb-4 aspect-square w-full bg-black object-cover`} />
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => camera ? (stop(), setCamera(false)) : void start()}>{camera ? en ? 'Stop camera' : 'Detener cámara' : en ? 'Open camera' : 'Abrir cámara'}</button>
      <Field label={en ? 'Read from a photo' : 'Leer desde una foto'}>{id => <input id={id} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="mt-4 max-w-full text-sm" onChange={event => { void image(event.target.files?.[0]); event.target.value = ''; }} />}</Field>
    </Panel><form onSubmit={event => { event.preventDefault(); stop(); setCamera(false); parse(text); }}><Panel>
      <Field label={en ? 'Or paste a profile link or address' : 'O pega un enlace de perfil o dirección'}>{id => <input id={id} value={text} maxLength={2048} onChange={event => { setText(event.target.value); setResult(null); setError(''); }} autoComplete="off" spellCheck={false} className="meli-field h-12 w-full px-3" />}</Field>
      <button className="btn btn-ghost btn-block" type="submit" disabled={busy || !text.trim()}>{en ? 'Review destination' : 'Revisar destino'}</button>
    </Panel></form>
    {busy ? <p role="status">{en ? 'Reading…' : 'Leyendo…'}</p> : null}
    {error ? <p role="alert" className="mb-4 text-sm text-danger">{error}</p> : null}
    {result ? <Panel><h2 className="mb-3 font-display text-lg">{en ? 'Review before continuing' : 'Revisa antes de continuar'}</h2><p className="break-all font-mono text-xs">{result.kind === 'address' ? result.address : result.path}</p>
      {result.kind === 'address' && result.chain ? <p className="mt-2 text-sm">Chain ID: {result.chain}</p> : null}
      <p className="my-4 text-sm text-text-muted">{en ? 'Scanning does not send funds. Amounts and execution instructions from the QR are ignored.' : 'Escanear no envía fondos. Los montos e instrucciones de ejecución del QR se ignoran.'}</p>
      <NavigationLink href={localizedPath(qrReviewPath(result), en)} className="btn btn-primary btn-block">{en ? 'Continue' : 'Continuar'}</NavigationLink>
    </Panel> : null}
  </>;
}
