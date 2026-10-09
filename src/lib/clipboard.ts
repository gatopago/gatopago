/**
 * Copies `text` to the clipboard from a click. The Clipboard API fails silently in some mobile
 * browsers (Brave and in-app browsers on iOS, PWAs without focus), so the old selection-based copy
 * runs first, synchronously inside the tap, and the Clipboard API is the fallback. Rejects when
 * neither works, so the screen can show the text for a manual copy.
 */
export async function copyText(text: string): Promise<void> {
  if (copyBySelection(text)) return;
  if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
  await navigator.clipboard.writeText(text);
}

function copyBySelection(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true; // no keyboard on iOS
  field.setAttribute('aria-hidden', 'true');
  // 16px avoids iOS zooming in; off-screen but still selectable.
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  document.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length); // iOS ignores select()
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    window.getSelection()?.removeAllRanges();
    active?.focus?.({ preventScroll: true });
  }
}
