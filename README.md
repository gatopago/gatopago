# GatoPago Web V3

Next.js consumer: marketing, login, shell de cuenta y checkout público. Wallet
Core y Flow siguen siendo los propietarios del estado y la autorización.
El acceso usa passkeys verificadas por Wallet Core y sesiones Firebase. La creación,
seguridad y transferencias se conectan a Account V3 en Arbitrum Sepolia. La prueba
completa requiere configuración de proveedores, una passkey y gas de prueba.

## Desarrollo local

Desde esta carpeta: `pnpm install --frozen-lockfile`. Copiar `.env.example` a
`.env.local`, completar los identificadores públicos de Firebase y ejecutar
`pnpm dev`. Abrir `http://localhost:3000`. Wallet Core se configura y arranca
por separado; sólo se necesita su URL, no su código fuente.
No poner claves privadas, cuentas de servicio ni secretos Turnstile en Web.

## Comprobaciones

Desde esta carpeta, sin instalar ni construir otros proyectos:

```powershell
pnpm verify
```

Incluye pruebas de auth/PWA, compatibilidad de protocolo, lint, tipos y build
con descriptor local `release.json` y snapshots verificados en `vendor/`. No
sustituye el smoke de Firebase/Turnstile provisionados ni las pruebas monetarias.

## Acceso con passkey

El registro requiere invitación, nombre, username y una passkey descubrible ES256.
La pantalla separa preparación, creación y confirmación de posesión: cada diálogo
WebAuthn comienza desde un gesto explícito. El login usa una credencial descubrible.
Wallet Core verifica las respuestas; sólo entonces Web intercambia el custom token
con Firebase. La sesión no sustituye las firmas de operaciones onchain.

Los enlaces de invitación usan `/login#invite=…`; el fragmento se retira del historial
al montar el formulario y no se persiste en localStorage. Cancelar WebAuthn no consume
la invitación. Después de un resultado incierto de registro, entrar con la passkey
permite continuar sin crear otro usuario. No hay reintentos automáticos.

Google, correo y los proxies de helpers Firebase fueron eliminados. El emulador
se mantiene aislado para pruebas del SDK, pero no ofrece un registro alternativo
sin Wallet Core. No constituye un entorno de aceptación completo de passkeys.
`GATOPAGO_LOCAL_AUTH=1` sigue prohibido fuera de desarrollo local.

## Configuración

El paquete versionado `@gatopago/environment` valida `.env.local`. No se seleccionan
hosts desde un JSON global. Las variables públicas compartidas con Wallet Core
son `GATOPAGO_ENVIRONMENT`, `GATOPAGO_WEB_ORIGIN`, `GATOPAGO_API_ORIGIN`,
`GATOPAGO_BUSINESS_ORIGIN`, `GATOPAGO_WALLET_NETWORKS` y `FIREBASE_PROJECT_ID`.
El RP de WebAuthn se deriva del hostname Web. HTTP sólo está permitido en loopback;
los dominios remotos requieren HTTPS.

Web añade `GATOPAGO_FIREBASE_WEB_API_KEY`, `GATOPAGO_FIREBASE_WEB_APP_ID` y
`GATOPAGO_TURNSTILE_SITE_KEY`. Son valores públicos. Para desarrollo local se admite
la site key de prueba documentada por Cloudflare si Web y API están en loopback.
Firebase sigue siendo el proyecto configurado, sin login con Google.

### Contrato de identidad de Wallet Core V3

Wallet Core expone cuatro rutas públicas POST bajo `/app/v1/auth`:

- `/register/options`: `{ invite, name, username, turnstile_token }`.
- `/register/complete`: `{ request_id, response }` con creación y posesión.
- `/login/options`: `{}`; sin allowlist de credenciales.
- `/login/complete`: `{ request_id, response }` con assertion y user handle.

Las respuestas completas contienen `{ custom_token }`, usado sólo con
`signInWithCustomToken`; las APIs autenticadas reciben el ID token resultante.
El proveedor custom, la referencia/versión de credencial y su estado local son
verificados por Wallet Core. La retirada de claves onchain se reconcilia con
ADMIN mediante dos RPC, con caché máxima de 30 segundos además del tiempo de
finalidad de la red. End-to-end validation against the deployed API is still pending.

Registro exige Turnstile con action `signup`. IP y cuota global limitan solicitudes;
la invitación se consume atómicamente al registrar. Las respuestas y solicitudes
están acotadas, el origen/RP se fijan por entorno y no se aceptan redirects.
Login/App tienen `no-store` y `no-referrer`; los documentos usan `frame-ancestors
'none'`. Falta el smoke con Firebase/Turnstile realmente provisionados.

## PWA V3: instalación, recarga y offline

- Identidad nueva: manifest `/manifest.webmanifest`, `id=/app`, `start_url=/app`,
  `scope=/`. Los dos PNG son la cara original de Meli, copiada con hash revisado
  mediante `scripts/import-v3-pwa-assets.mjs`; no se importa el SW de V1/V2.
- La cabecera de login/App ofrece **Instalar app**. Si el navegador entrega
  `beforeinstallprompt`, el botón abre su prompt exclusivamente al pulsarlo.
  Si no, ofrece instrucciones para Safari/iOS, Android o escritorio. Se puede
  seguir usando el navegador sin instalar. Un prompt bloqueado tiene timeout de 30s.
- **Recargar** aparece al ejecutar en `display-mode: standalone` o con la señal
  standalone de iOS. No se infiere una instalación OS por `localStorage` ni por
  aceptar un prompt. Recarga sólo el documento actual y nunca otras pestañas.
- El guard browser-only bloquea ese control durante restauración de sesión o
  mutaciones Firebase. Las operaciones monetarias E3/E4 deberán tomar el mismo
  guard y reconsultar operaciones submitted por ID; esto aún no está implementado.
- `/sw.js` sólo se registra en builds de release en el origen canónico o en
  loopback para pruebas. No se registra en `next dev`, con emulador ni previews.
  El runtime captura eventos una vez por documento, no por remontaje React.
- No `skipWaiting`, `clients.claim`, recarga en `controllerchange`, background
  sync ni cola de operaciones. Una versión pendiente muestra instrucciones:
  terminar operaciones, cerrar **todas** las ventanas del origen y reabrir.
  Recargar una sola pestaña no se anuncia como activación de esa actualización.
- Cache API sólo almacena `/offline` y assets de rutas estáticas permitidas:
  hasta 40 assets de 512 KiB cada uno, además del HTML neutro de máximo 8 KiB.
  Se excluyen query strings, Authorization, rangos, respuestas privadas/no-store,
  Vary sensible, redirects y tipos inesperados. La persistencia es best-effort,
  fuera del camino de la respuesta de red; un fallo de caché no bloquea la web.
- Documentos se consultan con `no-store`; sólo un fallo de red/timeout usa el HTML
  offline. No se ocultan 401/404/500. API, OAuth/Firebase, Flight, prefetch y
  solicitudes no GET quedan fuera de la interceptación. No se cachean sesiones,
  quotes, recibos o capabilities. El documento offline no contiene scripts, datos
  de usuario, balances ni confirmaciones y tiene CSP propia.

Smoke local del SW, **sin** `GATOPAGO_LOCAL_AUTH`:

```powershell
pnpm check:v3:web
pnpm --filter @gatopago/web start
```

Abrir `http://localhost:3000/app`, dejar completar el registro y recargar una vez
para obtener control (no hay `claim`). En DevTools verificar Cache Storage y
probar offline/online. Para una actualización con dos ventanas, mantener ambas
abiertas mientras cambia el SW: debe quedar waiting, conservar los documentos
y activarse al cerrar ambas y reabrir. No simular un pago enviando dinero real.

Los 115 tests Web y el smoke Chromium del sexto incremento se detallan en el
[registro E0–E4](../../docs/operations/v3-e0-e4-implementation.md#sexto-incremento-pwa-next-y-actualizaciones-8-de-septiembre-de-2026).
El modo standalone del smoke usó una señal de navegador simulada, **no prueba
instalación nativa ni funcionamiento físico en iPhone/Android**. También faltan
Gate W integral, CSP/auth de proveedores reales y compatibilidad monetaria de releases API/contratos.

## Compatibilidad con Wallet Core

Las solicitudes de registro y login llevan la revisión del protocolo, versión
de API, ambiente y contexto de contrato explícitamente `none`. El Worker decide
si son compatibles. Un `409 CLIENT_UPDATE_REQUIRED` bloquea nuevas solicitudes
del mismo runtime y muestra actualización/reapertura de ventanas. No se omite la verificación de Wallet Core ni se recarga a la fuerza.
Cerrar sesión sigue siendo posible. El botón Recargar usa el guard de operaciones.

La revisión `wallet-client-v3.1` viene del paquete de protocolo fijado en `vendor/`;
no se toma de la respuesta del servidor para fingir compatibilidad. Cambios de
UI que conservan el protocolo no requieren reconstruir Wallet Core.

`release.json` registra por separado la procedencia del build de Web. `build`
lo verifica con `scripts/check-release.mjs`. Después de cambiar sus fuentes,
revisar `node scripts/check-release.mjs --describe`, actualizar el descriptor y
reconstruir únicamente Web. El descriptor no autoriza pagos, no constituye una
firma de código ni prueba que ese build esté desplegado.

Los tests cubren transporte/código de rechazo, bloqueo de reintentos y guard.
El aviso completo con autenticación remota aún necesita prueba de navegador
against the configured production API; test fixtures are not enabled in production.
Esta integración no cierra compatibilidad monetaria ni Gate W.

## Evidencia, no promesa de producción

### CSP de documentos y límites de caché

Next genera un nonce aleatorio por respuesta y sobrescribe cualquier nonce/CSP
aportado por el visitante. El header enviado al renderer coincide con la CSP
de respuesta. No se eximen documentos por headers de prefetch/RSC. El nonce del
documento se conserva durante refresh interno; Turnstile lo recibe explícitamente.
En release no se permiten scripts inline sin nonce, `eval` ni handlers HTML.
Se permite CSS en atributos para la UI, no JavaScript. Los recursos estáticos,
SW y offline tienen sus propias políticas; una 404 desconocida es HTML inerte.

**Compromiso:** landing y páginas de cuenta pasan a SSR, con HTML `no-store`;
no se promete CDN/ISR de HTML ni mayor rendimiento sólo por usar Next. Los assets
versionados siguen cacheables. Medir coste/latencia antes de promover el origen.
Auth sólo permite sus endpoints necesarios; analytics/SDK wallet no se montan
en la landing. Ya no hay proxies ni excepciones de CSP para helpers de OAuth.

En Chromium release local se comprobaron cinco rutas 200 con todos sus scripts
nonced, una 404 sin scripts y bloqueo de dos scripts insertados en HTML (sin nonce
y con nonce incorrecto), con control positivo nonced. `page.evaluate` por sí solo
no sirve para probar ese bloqueo: DevTools puede eludir CSP al insertar scripts.
Los 140 tests Web, build y límites están registrados en la evidencia E0–E4.

Identidad y WebAuthn locales usan ahora `http://localhost:3000`: Chromium rechaza
una IP como RP ID. El servidor HTTP y el transporte del emulador siguen ligados
a `127.0.0.1`; eso no obliga a usar una IP como origen del navegador. No se
admiten ambos orígenes indistintamente ni se relajan los orígenes de release.

## V3 contract profile

`src/wallet/creation-release.ts` and `account-release.ts` consume the pinned public profile in `@gatopago/shared/v3/wallet-release`. Creation, account inspection and transfers use the Arbitrum Sepolia factory and implementation selected by Wallet Core. Production hosting remains testnet-only. RPC and operator credentials never enter Web.

Web configuration comes from explicit environment variables: `GATOPAGO_ENVIRONMENT=production`, `https://gatopago.com`, and `https://api.gatopago.com`. Local development uses loopback origins with the same protocol environment label. Old package manifests are not the deployment configuration. Web accesses Wallet Core through authenticated HTTP; loading a page does not sign or submit an operation.

## Adaptador de firma V3

`src/wallet/passkeys.ts` solicita una assertion únicamente desde una acción
explícita, en top-level seguro y con activación de usuario. Exige UV y la llave
seleccionada; bloquea dobles prompts y recargas, cancela por señal/expiración y
libera la UI incluso si el navegador no resuelve su Promise. No crea, retira ni
actualiza llaves al entrar en una pantalla; no envía ni reintenta operaciones.

El codec compartido verifica RP/origin, challenge, flags y firma P-256, normaliza
DER/low-S con `@noble/curves` y produce los bytes aceptados por el verifier de
Solidity. La pantalla futura debe derivar el digest del documento V3 revisado,
comprobar la política vigente y cancelar al cambiar de cuenta/ruta. No llamar
a este helper con un hash arbitrario recibido de la API.

La biblioteca queda fuera de los imports de marketing; login la usa para sus propias ceremonias. El smoke en
Chromium usa un harness local y un autenticador virtual; no es enrollment real,
prueba de iPhone/iCloud ni prueba de Account V3. Véase el noveno incremento del
[registro E0–E4](../../docs/operations/v3-e0-e4-implementation.md).

Los smokes históricos de Google/correo no validan este acceso nuevo. Las pruebas
actuales de transporte y SDK usan proveedores simulados; no prueban Firebase real,
Turnstile real, dispositivos físicos ni activación contractual. Esas verificaciones
siguen pendientes para la aceptación integral.

Referencia: [Firebase custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).


## Perfil y recepción por username

`/profile` lee el perfil de Wallet Core, permite editar el nombre visible y publicar
el username seleccionando explícitamente wallet y cuenta por red. Las listas de
wallets/cuentas se paginan; ninguna primera wallet se elige implícitamente. El
username y su wallet quedan fijos después de publicar. `/receive` enlaza el perfil
propio y solicita una verificación actual antes de mostrar/copiar una dirección.

`/@username` (también `/username`) consulta la API pública para la red seleccionada.
La página no acepta direcciones/importe del enlace como evidencia, retira la dirección
al vencer la respuesta y no refresca automáticamente. Desde allí se puede abrir un
envío con username y red como sugerencias, sin autorización ni importe predefinido.

El formulario de envío admite una dirección o username. Primero carga credenciales,
luego resuelve el username y prepara la operación con esa dirección exacta. La revisión
muestra username, nombre, red y dirección; no consulta de nuevo el nombre después de
firmar. La ventana de firma no supera la vigencia de la resolución ni la revisión
financiera. Este flujo aún requiere aceptación de navegador con proveedores reales.
