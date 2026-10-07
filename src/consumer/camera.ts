/**
 * The camera for scanning QR codes. `facingMode: 'environment'` alone may open any back lens: on
 * phones with several (the Galaxy S23, for one) Chrome can pick the ultra-wide, which has fixed
 * focus and blurs a QR held close. This opens the main lens in 1080p and remembers it.
 */

const STORAGE_KEY = 'gatopago.camera';
const QUALITY = { width: { ideal: 1920 }, height: { ideal: 1080 } };
/** A little zoom reads small QR codes without bringing the phone closer than it can focus. */
const ZOOM = 1.5;

type Capabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { min: number; max: number };
};

const open = (video: MediaTrackConstraints) =>
  navigator.mediaDevices.getUserMedia({ video: { ...video, ...QUALITY }, audio: false });

const release = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

const capabilities = (stream: MediaStream): Capabilities =>
  (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as Capabilities;

/** Whether the lens can focus up close; unknown when the browser does not say. */
const focusesClose = (stream: MediaStream) =>
  capabilities(stream).focusMode?.includes('continuous');

/** Android names its cameras `camera2 <n>, facing back`; 0 is the main one. */
const androidIndex = (device: MediaDeviceInfo) =>
  Number(/camera2 (\d+)/.exec(device.label)?.[1] ?? Number.MAX_SAFE_INTEGER);

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(deviceId: string | null | undefined) {
  try {
    if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Private mode: it chooses again next time. */
  }
}

async function choose(): Promise<MediaStream> {
  const saved = remembered();
  if (saved) {
    try {
      return await open({ deviceId: { exact: saved } });
    } catch {
      remember(null);
    }
  }
  const stream = await open({ facingMode: { ideal: 'environment' } });
  const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
  const verdict = focusesClose(stream);
  if (verdict) {
    remember(current);
    return stream;
  }
  // Labels are readable once the permission is granted.
  const backs = (await navigator.mediaDevices.enumerateDevices())
    .filter((device) => device.kind === 'videoinput' && /back|rear|environment/i.test(device.label))
    .sort((a, b) => androidIndex(a) - androidIndex(b));
  // Focus unknown: trust the main Android camera, if this is not it already.
  const candidates =
    verdict === undefined ? backs.filter((device) => androidIndex(device) === 0) : backs;
  if (!candidates.some((device) => device.deviceId !== current)) return stream;

  // Android cannot keep two cameras open: release this one before trying the next.
  release(stream);
  for (const device of candidates) {
    if (device.deviceId === current) continue;
    try {
      const next = await open({ deviceId: { exact: device.deviceId } });
      if (focusesClose(next) !== false) {
        remember(device.deviceId);
        return next;
      }
      release(next);
    } catch {
      /* Busy or gone: the next one. */
    }
  }
  return open({ facingMode: { ideal: 'environment' } });
}

/** Opens the main back camera with continuous focus and a little zoom, where the phone allows. */
export async function openScanCamera(): Promise<MediaStream> {
  const stream = await choose();
  const track = stream.getVideoTracks()[0];
  const { focusMode, zoom } = capabilities(stream);
  const advanced: Record<string, unknown>[] = [];
  if (focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (zoom && zoom.max >= ZOOM) advanced.push({ zoom: Math.max(zoom.min, ZOOM) });
  if (track && advanced.length)
    await track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => undefined);
  return stream;
}

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};
let detector: Promise<Detector | null> | undefined;

/**
 * Chrome on Android reads QR codes natively: faster than jsQR and with blurrier or tilted frames.
 * Safari and most desktop browsers do not have it and use jsQR.
 */
export function qrDetector() {
  return (detector ??= (async () => {
    const Native = (window as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (!Native) return null;
    try {
      return (await Native.getSupportedFormats()).includes('qr_code')
        ? new Native({ formats: ['qr_code'] })
        : null;
    } catch {
      return null;
    }
  })());
}
