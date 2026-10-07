import { describe, expect, it } from 'vitest';
import { mainBackCamera } from '../src/consumer/camera';

const camera = (deviceId: string, label: string, kind: MediaDeviceKind = 'videoinput') => ({
  deviceId,
  label,
  kind,
});

describe('Main back camera', () => {
  it("picks Android's lowest back camera, not the ultra-wide listed first", () => {
    const devices = [
      camera('wide', 'camera2 2, facing back'),
      camera('front', 'camera2 1, facing front'),
      camera('main', 'camera2 0, facing back'),
      camera('tele', 'camera2 3, facing back'),
      camera('mic', 'Default', 'audioinput'),
    ];
    expect(mainBackCamera(devices)?.deviceId).toBe('main');
  });
  it('leaves the choice to the browser where cameras are not named by Android', () => {
    // iPhone, a computer, and any device before the permission (labels are empty then).
    expect(
      mainBackCamera([camera('a', 'Back Ultra Wide Camera'), camera('b', 'Back Camera')]),
    ).toBeUndefined();
    expect(mainBackCamera([camera('c', 'Integrated Webcam')])).toBeUndefined();
    expect(mainBackCamera([camera('d', ''), camera('e', '')])).toBeUndefined();
  });
});
