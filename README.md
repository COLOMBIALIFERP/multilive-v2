# MultiLIVE v2.0.6

Corrección general de alertas automáticas para **TikTok, Starvios, Kick y Twitch**. La deduplicación delimita la sesión por el último estado `offline` confirmado, incluso si una plataforma reutiliza un ID de transmisión. Los detectores siguen exigiendo un estado `live` confirmado antes de notificar; los errores o estados desconocidos no se interpretan como offline. La detección real depende de la respuesta disponible de cada plataforma.

## Novedad v2.0.4 — Starvios para todos los miembros de ESTE servidor

- `/stream agregar plataforma:starvios usuario:canal`: cualquier miembro del servidor puede agregar un streamer de Starvios.
- `/stream eliminar plataforma:starvios usuario:canal`: cada miembro puede eliminar solo los que agregó; un administrador puede eliminar cualquiera.
- En Netlify ya **no es obligatoria** la variable `STARVIOS_DISCOVERY_URL`: por defecto se utiliza la ruta pública `https://starvios.com/api/public/discovery`, con `username` diferente para cada cuenta.
- Hasta 2 canales Starvios por miembro y 6 Starvios en total en este proyecto Netlify. Al alcanzar el cupo, un administrador debe liberar espacios; es un límite real de esta versión, no una oferta de servicio ilimitado.
- Todos los avisos se publican en el canal determinado por **un único webhook**, no en un canal privado por usuario.
- **Todavía no es un bot instalable en cualquier servidor Discord**: está restringido a `DISCORD_GUILD_ID`. Para múltiples servidores hace falta otro diseño con almacenes, webhooks e instalación independiente por guild.
- Se requiere volver a registrar el comando `/stream` desde el botón **Instalar comandos /stream** para actualizar las descripciones (sin cambiar bot ni claves); los cambios en permiso funcionan desde que se despliegue el código.
- API Starvios no oficial/documentada: su disponibilidad y condiciones pueden cambiar. Las pruebas locales no prueban envíos reales.

---

# MultiLIVE v2.0.4 · Starvios comunitario

**Revisión 2.0.2 (26/10/2026):** corrige el error de inicialización de `tiktok-live-connector` 2.5.0 (`Cannot read properties of undefined (reading 'processInitialData')`), al pasar un objeto de opciones explícito; ajusta el temporizador de TikTok a 12 segundos, como indica el mensaje de error. Mantiene la gestión de comandos y diagnósticos introducidos en v2.0.1. No garantiza que TikTok entregue estados fiables. Revisa `INSTRUCCIONES_ACTUALIZACION.txt` antes de publicar.

Versión de Netlify para Colombia Life RP. **No depende de un PC encendido**. Mantiene las alertas por webhook como antes, pero ahora incorpora una aplicación de Discord con comandos `/stream`.

## Lo que cambia con respecto al ZIP anterior

- Las cuentas vigiladas se agregan y eliminan en **Discord**, no en variables de entorno.
- Netlify Blobs guarda las cuentas en un almacén del proyecto que **sobrevive a los despliegues**.
- Los directos se revisan automáticamente cada **10 minutos**; `/stream revisar` solicita una comprobación inmediata.
- Los avisos reales siguen entrando al canal mediante `DISCORD_WEBHOOK_URL`, que ya probaste.
- Los comandos de altas/bajas en Starvios están disponibles para **todos los miembros** (máximo 2 cuentas propias por miembro, 6 Starvios en total). Las altas/bajas de otras plataformas y `/stream revisar` requieren **Administrator**; `/stream lista` y `/stream directos` están disponibles a los demás miembros del servidor, mostrando un resultado privado (efímero) al solicitante.
- Las notificaciones **no son instantáneas** y los directos breves entre intervalos pueden perderse.

## Paso 1 — Publicar esta versión

Actualiza los archivos del repositorio conectado a tu proyecto Netlify. Respeta la carpeta base existente `multilive_discord_netlify/`. Este ZIP contiene los **archivos internos** de esa carpeta: sobrescribe allí los archivos equivalentes y añade los nuevos. Mantén en Netlify `Base directory=multilive_discord_netlify`, `Publish directory=public`, `Functions directory=netlify/functions`. La configuración anterior de Netlify sigue siendo válida.

*No vuelvas a subir el ZIP antiguo.* Los archivos nuevos son `lib/watchlist.mjs`, `lib/runner.mjs`, `lib/discord-commands.mjs`, `netlify/functions/discord-interactions.mjs` y `netlify/functions/install-commands.mjs`. Se reemplazan `netlify/functions/check-lives.mjs`, `public/index.html` y `README.md` (entre otros). El webhook y `TEST_SECRET` existentes permanecen configurados en Netlify.

## Paso 2 — Aplicación Discord (una sola vez)

1. En https://discord.com/developers/applications crea una **aplicación** y un bot, o utiliza una aplicación de Discord propia que puedas administrar.
2. En **General Information**, copia **APPLICATION ID** y **PUBLIC KEY** (son valores diferentes).
3. En **Bot**, genera/copia **TOKEN**. Nunca compartas el token, ni con ChatGPT, ni en imágenes. En caso de filtración, regénéralo.
4. Activa modo desarrollador en Discord (**Ajustes → Avanzado → Modo desarrollador**), clic derecho sobre el ícono del servidor → **Copiar ID de servidor (Guild ID)**.
5. En Netlify → Project configuration → Environment variables, añade los siguientes secretos/valores (sin cambiar los que ya funcionan):

   | Variable | Contenido |
   |---|---|
   | `DISCORD_APPLICATION_ID` | Application ID de Discord |
   | `DISCORD_PUBLIC_KEY` | Public Key de Discord |
   | `DISCORD_GUILD_ID` | ID numérico de tu servidor |
   | `DISCORD_BOT_TOKEN` | Token del bot (marcar como secreto) |

6. En el portal Discord → tu aplicación → **General Information** (sección **Interactions Endpoint URL**), introduce la URL de la función:

   `https://TU-SITIO.netlify.app/.netlify/functions/discord-interactions`

   Sustituye `TU-SITIO.netlify.app` por tu dominio real. Pulsa **Save Changes**. Discord comprueba que la función responda PING firmado. Si falla, verifica variables, que Netlify ya haya desplegado esta versión y revisa los registros de `discord-interactions`.
7. En Discord Developer Portal → **Installation**, configura **Guild Install**, con `applications.commands` y, si deseas mostrar un bot miembro del servidor, también `bot`. Instálalo mediante el enlace de instalación en **tu servidor** con permisos de administración para instalar aplicaciones. Para usar solamente los comandos HTTP, el permiso `applications.commands` es suficiente.
8. Abre la página publicada de Netlify, escribe tu clave **TEST_SECRET** en **Instalar comandos /stream** y pulsa el botón. Esto registra un único comando en el servidor sin borrar otros comandos de la aplicación. La clave no se almacena en el navegador.

## Paso 3 — Gestiona todo desde Discord

Escribe `/stream` en un canal y elige un subcomando:

| Comando | Qué hace |
|---|---|
| `/stream agregar plataforma:tiktok usuario:djcr0ss` | Vigila esa cuenta |
| `/stream agregar plataforma:kick usuario:djcr0ss` | Vigila Kick |
| `/stream agregar plataforma:twitch usuario:djcr0ss` | Vigila Twitch |
| `/stream agregar plataforma:starvios usuario:djcr0ss` | Vigila Starvios (detección mediante discovery (configurable) |
| `/stream lista` | Muestra todas las cuentas registradas |
| `/stream directos` | Muestra las cuentas que figuraban LIVE en la **última comprobación** (máximo 30 min de antigüedad) |
| `/stream revisar` | Verifica cuentas en ese momento y actualiza la última comprobación; los resultados aparecen en un mensaje privado |
| `/stream eliminar plataforma:kick usuario:djcr0ss` | Quita una cuenta |

**La primera vez**, si necesitas que se lance la comprobación sin esperar al ciclo automático, ejecuta `/stream revisar`. Si una plataforma necesita credenciales que faltan, se reflejará como error, no como offline. Si un detector falla, el resultado incluye el motivo abreviado; también queda registrado en los logs de la función que hizo la comprobación. `/stream directos` no verifica al momento; para verificar al momento se usa `/stream revisar`.

### Límite de esta versión

Hasta **6 cuentas por plataforma**. Así se preserva el funcionamiento dentro de los límites de ejecución de Netlify y del proyecto original. El almacén usa **Netlify Blobs**, que persiste entre despliegues. No hacen falta variables `TWITCH_USERS`, `KICK_USERS`, `TIKTOK_USERS`, `STARVIOS_USERS`: **esta versión no las lee**. Si las tenías configuradas antes, vuelve a añadir esos usuarios en Discord y, tras comprobar que están en `/stream lista`, puedes borrar las variables antiguas.

### Claves de Twitch y Kick (detectores oficiales)

Twitch necesita `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` y Kick necesita `KICK_CLIENT_ID` + `KICK_CLIENT_SECRET`. Esos valores son credenciales de API de cada plataforma, **no nombres de usuarios**, por lo que sí se guardan como secretos en Netlify una sola vez. Para obtenerlos, usa el portal de desarrolladores oficial de cada plataforma.

### TikTok y Starvios

- TikTok usa `tiktok-live-connector`, que es **no oficial**. Puede dar resultados desconocidos o fallar si TikTok modifica sus protecciones.
- Starvios consulta por defecto `https://starvios.com/api/public/discovery?kind=channel&username=...`, con `username` dinámico según cada cuenta registrada. **No necesitas STARVIOS_DISCOVERY_URL**; la variable queda opcional para sustituir la URL base si Starvios cambia de ruta. No configures una URL diferente para cada streamer.
- La consulta debe ser públicamente accesible y estar autorizada. `STARVIOS_PUBLIC_API_KEY` es opcional **solo si tienes una clave pública de cliente autorizada**; no copies cookies, tokens de sesión ni credenciales ajenas. La clave se guarda únicamente en Netlify.
- `stream.status === "live"` activa el aviso y utiliza `stream.id` para evitar duplicados; `idle` significa no activo aunque `started_at` tenga fecha. Estados desconocidos o respuestas HTTP 401/403 producen ERROR, nunca OFFLINE.
- La integración utiliza un endpoint observado en el navegador, no una API oficialmente documentada. Puede cambiar o imponer límites. Sin `STARVIOS_DISCOVERY_URL` usa directamente el endpoint público; ya no recurre al HTML experimental.

## Seguridad y funcionamiento

- La petición de Discord se verifica con firma Ed25519 y se limita a tu Guild ID.
- Las altas de Starvios están abiertas a miembros del servidor; cada miembro solo puede eliminar sus propios registros. Un administrador puede gestionar cualquiera y revisar manualmente; las otras plataformas siguen siendo administrativas; los resultados de los comandos son **efímeros**.
- Los tokens quedan únicamente como secretos en Netlify. El navegador no recibe los tokens.
- `TEST_SECRET` protege la instalación de comandos y las alertas de prueba.
- Los comandos no necesitan una conexión Gateway 24/7: usan **Interactions Endpoint URL** firmado. Netlify responde a Discord inmediatamente y termina la operación en segundo plano mediante `context.waitUntil()`.
- El aviso automático usa tu webhook existente y su almacenamiento anti-duplicados. Se aplica una espera de 90 segundos entre revisiones manuales para limitar llamadas a las plataformas.
- El despliegue exitoso y la prueba del webhook **no demuestran** que Twitch, Kick, TikTok y Starvios detecten directos reales: hay que probar al menos una cuenta real por plataforma.
- Netlify tiene límites de uso y Netlify Blobs no garantiza transacciones atómicas entre claves diferentes. Este diseño es apropiado para una pequeña lista administrada por unos pocos moderadores; si requieres miles de canales o altas simultáneas, usa una base de datos transaccional y workers dedicados.

## Comprobar errores

Netlify → Logs → Functions → `discord-interactions`, `check-lives`, `install-commands`. No copies registros que contengan tokens o URLs secretas. Si falla el registro de comandos y aparece `HTTP 401`, verifica el token; si aparece `HTTP 403`, verifica la instalación/permisos de la aplicación. Verifica también que `DISCORD_GUILD_ID` y `DISCORD_APPLICATION_ID` correspondan al mismo servidor y a la aplicación que estás instalando.

## Código

- `lib/watchlist.mjs`: validación y almacenamiento de cuentas
- `lib/discord-commands.mjs`: firmas, permisos, comandos y respuestas
- `lib/runner.mjs`: detector compartido entre cron y comando manual
- `netlify/functions/discord-interactions.mjs`: endpoint firmado de Discord
- `netlify/functions/install-commands.mjs`: registro del comando protegido
- `netlify/functions/check-lives.mjs`: ejecución programada, cada diez minutos

Pruebas locales de lógica: `npm test` (sin conectar con cuentas reales).
