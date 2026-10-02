# Mejoras de frontend, UX y limpieza

> Historical implementation snapshot. Current acceptance results and unresolved
> work are recorded in [CLEANUP-2026-10-02.md](docs/operations/CLEANUP-2026-10-02.md).
> This earlier snapshot is not evidence that the complete cleanup goal is finished.

**Estado:** frontend implementado y verificación local aprobada, incluidos los paquetes compartidos 3.1.1 actualizados en paralelo. Quedan las comprobaciones externas indicadas abajo.
**Alcance:** frontend actual y pruebas locales. Sin retrocompatibilidad V2.

## Resultado esperado

Crear cuenta inicia un recorrido que incluye crear y comprobar la passkey,
autorizar la configuración y crear la wallet. Los consentimientos requeridos
por el protocolo se explican como pasos de ese mismo recorrido. Una respuesta
incierta se consulta por su referencia; nunca se interpreta como permiso para
crear otra cuenta o repetir una firma.

## Cambios implementados

### Acceso y registro

- Botones **Iniciar sesión** y **Crear cuenta**; invitación como requisito secundario.
- Progreso Datos / Passkey / Wallet, acciones concretas y mensajes bilingües.
- Invitación, nombre y nombre de usuario conservados al retroceder dentro del flujo.
- Errores de invitación y usuario asociados al campo; explicación de Turnstile.
- Explicación previa de por qué se crea y después se comprueba la misma llave.
- Cancelar la comprobación distingue una passkey guardada de un registro confirmado.
- Redirección del registro a `/onboarding`; login existente a `/app`.
- Eliminado el modal obligatorio en escritorio. La cabecera se compacta al entrar
  en un paso para que el formulario quede accesible sin la presentación decorativa.
- Foco al cambiar de paso y al volver a las opciones; controles utilizables por teclado.

### Creación de wallet

- Nueva `WalletOnboarding.tsx` integra inventario, historial, consentimiento,
  cotización, autorización de red y seguimiento de creación.
- La única passkey disponible se selecciona automáticamente. Varias llaves
  conservan selector explícito; añadir un respaldo no bloquea la creación.
- Consulta previa de solicitudes. Una sola solicitud compatible se reanuda;
  historial incompleto, varias solicitudes o llaves/perfiles incompatibles
  requieren revisión. Las solicitudes con operación registrada no se reemplazan.
- El registro conserva acceso aunque la creación esté temporalmente deshabilitada.
  La cuenta ofrece continuar la configuración y los errores ofrecen reintentar.
- Coste máximo calculado y responsable del pago visibles antes de firmar.
- Seguimiento automático de lectura de la misma operación cada cinco segundos
  mientras la pantalla está visible; sin preparar, firmar ni reenviar desde efectos.
- Confirmación de creación basada en evidencia validada, con enlace a la wallet.
  Las fechas y detalles técnicos quedan en el comprobante desplegable.
- Seguridad vuelve a centrarse en gestionar llaves; crear la wallet ya no exige
  descubrir ese apartado.

### Funciones sin integración

- Cobro, swap, cross-chain y Earn muestran disponibilidad, sin formularios que
  pidan datos para terminar en un botón permanentemente deshabilitado.
- Contactos muestra su disponibilidad mientras guardar no esté conectado.
- Ajustes y Enviar no enlazan Contactos o Fondos de prueba como acciones listas
  para usar. Eliminados los botones permanentemente deshabilitados de sus estados
  informativos, y de las vistas sin identidad de perfil, recepción y seguridad.
- Recibir abre directamente la recepción verificada, sin una pantalla intermedia
  con una única opción funcional.
- Home prioriza Recibir, Enviar y Escanear. Move identifica las funciones pendientes;
  la navegación principal no presenta Crecer como una acción operativa.
- Checkout público informa la falta de integración y no simula autorización.

### Eliminación de residuos

- Eliminadas las rutas antiguas `/security`, `/recover`, `/deposit/binance`,
  `/pay`, `/pay/status` y `/cc/[recipient]`, junto con aliases de compatibilidad.
- El usuario público solo acepta `/@usuario`. Eliminada la traducción QR de
  `/pay?id=…`; la ruta actual de enlaces es `/pay/[linkId]`.
- Eliminados `MobileUseNotice`, `AmountInput`, `UnavailableAction` y
  `requestPasskeyAssertion` sin uso.
- Eliminada la rama de backup solo consumida por harnesses: pantallas, políticas,
  flujo, fixtures, pruebas exclusivas y scripts. Se mantienen las verificaciones
  compartidas, el inventario de credenciales y el alta activa de llaves adicionales.
- Quitado CSS del modal y rama eliminados, overrides de marketing redundantes y
  tres selectores de acceso sin elementos consumidores actuales.
- Corregidas descripciones de acceso Google/correo y recuperación por guardianes
  en marketing, términos y privacidad para reflejar el modelo actual de llaves.
- README actualizado para este repositorio; sin enlaces a documentos de otro checkout
  ni resultados antiguos usados como evidencia de la implementación actual.
- Knip fijado en `devDependencies`, análisis normal/producción reproducible e
  integrado en `pnpm verify`. No se usó una purga automática por heurísticas.

## Límite pendiente del servicio

**Wallet Core exige un límite de comisión antes de preparar la cotización.**
El frontend muestra la unidad y un ejemplo numérico explicado; no lo presenta
como una recomendación ni autoriza cobros al consultarlo. La revisión posterior
muestra el máximo calculado y quién paga antes de firmar.

Eliminar por completo este campo requiere que Wallet Core entregue una cotización
o un límite recomendado verificable sin pedirlo antes al usuario. Es el único
punto del recorrido propuesto que necesita ampliar el trabajo al backend.
No se modificaron contratos, Worker, Firebase ni la configuración de red.

## Comprobaciones y evidencia

- `pnpm verify` aprobado sobre el árbol conjunto con los paquetes 3.1.1:
  lint sin advertencias, tipos, 767 pruebas en 35 archivos,
  ambos análisis Knip, cuatro snapshots locales verificados y build de Next.
- Knip normal y producción: sin hallazgos.
- Chromium con autenticador virtual y API sintética: datos conservados al volver,
  creación de passkey, cancelación de su comprobación, reintento con la misma llave,
  registro a wallet, única llave sin selector, ambos consentimientos, recarga,
  reanudación y confirmación de creación en la UI.
- Ambos smokes de navegador se repitieron con los nuevos paquetes compartidos.
  `release.json` se actualizó y el build verificó su correspondencia con las fuentes.
- Contadores del harness: una preparación y confirmación del registro, una
  preparación y autorización del consentimiento inicial, una preparación y
  autorización de creación; cero reenvíos duplicados.
- Cambio de usuario, traducción y fallo de inventario con reintento en el harness:
  sin conservar la wallet anterior ni preparar operaciones por cambiar de pantalla
  o idioma. Contadores de mutaciones iguales antes y después de esas comprobaciones.
- Next en desarrollo, 390 × 844: capturas revisadas de acceso y registro en español;
  el registro se abre sin la presentación decorativa, recibe el foco y no desborda
  horizontalmente. Evidencia local en `output/playwright/`.

## Comprobaciones pendientes

- La revisión automática de permisos rechazó iniciar `next start` para la pasada
  visual del build local: indicó «bloqueado por política» sin un motivo adicional.
  El build sí pasó. Falta esa revisión visual de release en escritorio y móvil,
  en ambos idiomas; los smokes de componentes no la sustituyen.

El harness simula Firebase/identidad, servicio y confirmación de red. Verificar
el mismo recorrido con proveedores provisionados y en dispositivos físicos
sigue pendiente. Ninguna prueba local demuestra un despliegue de wallet real
ni publica estos cambios.
