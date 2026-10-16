/**
 * The camera for scanning QR codes. `facingMode: 'environment'` alone may open any back lens: on
 * phones with several (the Galaxy S23, for one) Chrome can pick the ultra-wide, which has fixed
 * focus and blurs a QR held close. Android names its cameras `camera2 <n>, facing back`, and the
 * lowest number is the main lens: that one opens, once. Elsewhere (iPhone, computers) the browser's
 * own choice is already the main lens. A browser that hides the names (Brave may) leaves the choice
 * to itself: the scan screen lets the person switch lenses, and the one chosen opens next time.
 */

// The first version chose by reported focus, which an ultra-wide can pass: its choice is ignored.
const STORAGE_KEY = 'gatopago.camera.v2';
// The sensor's own 4:3. A 16:9 frame turned upright is tall and narrow, and the square preview
// cropped almost half of it: the scan looked zoomed in.
const QUALITY = { width: { ideal: 1440 }, height: { ideal: 1080 } };

const open = (video: MediaTrackConstraints) =>
  navigator.mediaDevices.getUserMedia({ video: { ...video, ...QUALITY }, audio: false });

const androidIndex = (device: Pick<MediaDeviceInfo, 'label'>) =>
  Number(/camera2 (\d+)/.exec(device.label)?.[1]);

type Camera = Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>;

/** Android's back lenses by number, the main one first; none where cameras are not named that way. */
const androidBackCameras = <T extends Camera>(devices: readonly T[]) =>
  devices
    .filter(
      (device) =>
        device.kind === 'videoinput' &&
        /facing back/i.test(device.label) &&
        Number.isInteger(androidIndex(device)),
    )
    .sort((a, b) => androidIndex(a) - androidIndex(b));

/** Android's main back lens, by name; none where cameras are not named that way. */
export const mainBackCamera = <T extends Camera>(devices: readonly T[]): T | undefined =>
  androidBackCameras(devices)[0];

/**
 * The cameras the scan screen switches between: on Android, the back lenses, main one first.
 * Where they are not named that way (an iPhone, a computer, or a browser that hides their names,
 * so the choice above cannot be made), every camera not named as a front one.
 */
export function scanCameras<T extends Camera>(devices: readonly T[]): T[] {
  const android = androidBackCameras(devices);
  if (android.length) return android;
  return devices.filter((device) => device.kind === 'videoinput' && !/front/i.test(device.label));
}

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(deviceId: string | null) {
  try {
    if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Private mode: it chooses again next time. */
  }
}

/** A camera's flashlight, where it has one (Chrome on Android); the DOM types do not list it yet. */
export type Torch = MediaTrackConstraintSet & { torch?: boolean };

/**
 * Opens the main back camera, 4:3 in up to 1440×1080; with `deviceId`, the one the person chose,
 * which opens from then on.
 */
export async function openScanCamera(deviceId?: string): Promise<MediaStream> {
  if (deviceId) {
    const stream = await open({ deviceId: { exact: deviceId } });
    remember(deviceId);
    return stream;
  }
  const saved = remembered();
  if (saved) {
    try {
      return await open({ deviceId: { exact: saved } });
    } catch {
      remember(null);
    }
  }
  // With the permission already given, names are readable before opening anything.
  // Listing cameras is best effort: when it fails, the browser's choice is used, and a camera
  // already open is returned, never left running.
  const devices = () => navigator.mediaDevices.enumerateDevices().catch(() => []);
  const known = mainBackCamera(await devices());
  if (known) {
    try {
      const stream = await open({ deviceId: { exact: known.deviceId } });
      remember(known.deviceId);
      return stream;
    } catch {
      /* Busy or gone: the browser's choice below. */
    }
  }
  const stream = await open({ facingMode: { ideal: 'environment' } });
  const main = mainBackCamera(await devices());
  const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (!main || main.deviceId === current) {
    if (main) remember(main.deviceId);
    return stream;
  }
  // Android cannot keep two cameras open: release this one before opening the main lens.
  stream.getTracks().forEach((track) => track.stop());
  try {
    const next = await open({ deviceId: { exact: main.deviceId } });
    remember(main.deviceId);
    return next;
  } catch {
    return open({ facingMode: { ideal: 'environment' } });
  }
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

/**
 * The QR drawn on `canvas` (`context` is its 2D context), or null: read natively where the browser
 * can, else with jsQR. When the native reader finds nothing, jsQR tries as well if `retry`: it reads
 * some codes the native one misses, at a cost the camera pays only every few frames.
 */
export async function readQr(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  retry = true,
): Promise<string | null> {
  const native = await qrDetector();
  if (native) {
    try {
      const raw = (await native.detect(canvas))[0]?.rawValue;
      if (raw || !retry) return raw ?? null;
    } catch {
      /* jsQR below. */
    }
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import('jsqr');
  return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
}
