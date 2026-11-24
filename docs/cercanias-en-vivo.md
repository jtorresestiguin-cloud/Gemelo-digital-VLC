# Cercanías en vivo: cómo activar el intermediario (gratis, unos 10 minutos)

Renfe publica en abierto dónde está cada tren, su retraso y los avisos, pero no deja que una web los lea
directamente. Por eso hace falta un pequeño «intermediario»: un servicio gratuito de Cloudflare que lee los
datos de Renfe cada 20 segundos y se los pasa al gemelo digital. No guarda nada ni recibe datos de los visitantes.

El plan gratuito de Cloudflare permite 100 000 consultas al día, de sobra para este uso.

## Pasos

1. Crea una cuenta gratuita en **https://dash.cloudflare.com/sign-up** (correo y contraseña) y confirma el correo.
   No hace falta tarjeta ni dominio propio.
2. En el menú de la izquierda entra en **Workers & Pages** (puede aparecer como *Compute (Workers)*).
   La primera vez te pedirá elegir un subdominio gratuito `*.workers.dev`: escribe el que quieras, por ejemplo `gemelo-vlc`.
3. Pulsa **Create** → **Start with Hello World!** (o *Create Worker*).
   - Nombre: `cercanias-vlc`
   - Pulsa **Deploy**.
4. Pulsa **Edit code**. Borra todo el código que aparece y pega el contenido de este fichero:
   https://raw.githubusercontent.com/jtorresestiguin-cloud/Gemelo-digital-VLC/claude/great-sagan-g5ximz/cloudflare/cercanias-worker.js
   (ábrelo, selecciona todo con Ctrl+A / Cmd+A, copia y pega).
5. Pulsa **Deploy** (arriba a la derecha).
6. Copia la dirección que aparece, del tipo `https://cercanias-vlc.gemelo-vlc.workers.dev`, y ábrela en el navegador:
   debe verse un texto que empieza por `{"updated":…,"trains":[…`.
7. Envía esa dirección: se añade al gemelo digital y, al publicarse, la capa **Cercanías** mostrará los trenes moviéndose
   (cada 30 s), su retraso y los avisos de Renfe.

La dirección no es secreta: no da acceso a tu cuenta.

## Si algún día deja de funcionar

- El mapa seguirá mostrando líneas y estaciones; solo desaparecen los trenes en vivo.
- En Cloudflare → Workers & Pages → `cercanias-vlc` → *Logs* se ve si Renfe ha cambiado algo.
- Datos: Renfe, GTFS-Realtime (licencia CC BY 4.0).
