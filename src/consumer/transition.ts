/**
 * Screen changes animated by the browser (View Transitions): the screen you leave goes while the
 * next one comes, instead of vanishing at once. A tap on a link or on back changes screen inside
 * one, once the browser holds the screen being left; the account's layout ends it when the next
 * screen is on the page, with the direction the record of visited screens gave it
 * (`data-screen-transition` on `<html>`, animated in consumer.css). Browsers without them, and
 * people who ask for less motion, keep the CSS entrance.
 */
let finish: ((direction: string) => void) | null = null;
let changing = false;

/** Goes to another screen (`navigate`): animated where the browser can, at once otherwise. */
export function navigateWithTransition(navigate: () => void) {
  if (
    changing ||
    !('startViewTransition' in document) ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return navigate();
  changing = true;
  const root = document.documentElement;
  root.dataset.screenTransition = 'pending';
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        finish = (direction) => {
          finish = null;
          root.dataset.screenTransition = direction;
          resolve();
        };
        // A navigation that never shows another screen (blocked, failed) must not hold the page.
        setTimeout(() => finish?.('none'), 1200);
        navigate();
      }),
  );
  // A skipped transition (another one, the tab hidden) only means no animation.
  transition.ready.catch(() => undefined);
  const done = () => {
    changing = false;
    delete root.dataset.screenTransition;
  };
  void transition.finished.then(done, done);
}

/** The next screen is on the page: the browser animates to it. Whether a transition was waiting. */
export function finishScreenTransition(direction: string) {
  if (!finish) return false;
  finish(direction);
  return true;
}

/** Whether a link goes to another screen (another path, whatever the language), not the same one. */
export function leadsElsewhere(href: unknown): href is string {
  if (typeof href !== 'string' || href.startsWith('#')) return false;
  const here = window.location.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  return new URL(href, window.location.origin).pathname !== here;
}
