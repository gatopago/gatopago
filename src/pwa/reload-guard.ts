let active = 0;
const listeners = new Set<() => void>();
export const subscribeReloadGuard = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const isReloadBlocked = () => active > 0;
export const serverReloadBlocked = () => false;

export function holdPageReload(): () => void {
  active += 1;
  for (const listener of listeners) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
    for (const listener of listeners) listener();
  };
}

export function reloadPage(): boolean {
  if (isReloadBlocked() || typeof window === 'undefined') return false;
  window.location.reload();
  return true;
}
