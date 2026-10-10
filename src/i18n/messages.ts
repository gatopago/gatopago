import type { Messages } from 'next-intl';

/** Texts read only on the server (public pages, page titles): they never reach the browser. */
const SERVER_ONLY = [
  'Landing',
  'Terms',
  'Privacy',
  'Legal',
  'Docs',
  'Metadata',
  'Titles',
  'NotFound',
  'Demo',
] as const satisfies readonly (keyof Messages)[];

/** The prerendered pages' client components: the frame and the copy buttons. */
const PUBLIC = [
  'ConsumerFrame',
  'PwaControls',
  'Primitives',
  'Copy',
] as const satisfies readonly (keyof Messages)[];

/** What the app's client components read, without the server's own texts. */
export const appMessages = (messages: Messages) =>
  Object.fromEntries(
    Object.entries(messages).filter(
      ([namespace]) => !(SERVER_ONLY as readonly string[]).includes(namespace),
    ),
  );

/** What a prerendered page's client components read: a few namespaces. */
export const publicMessages = (messages: Messages) =>
  Object.fromEntries(PUBLIC.map((namespace) => [namespace, messages[namespace]]));
