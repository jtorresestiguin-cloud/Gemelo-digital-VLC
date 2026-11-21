// Graba un vídeo para redes sociales del gemelo digital PUBLICADO (ciudad fotorrealista).
// Se ejecuta en GitHub Actions (workflow «Vídeo para redes»): mueve la cámara fotograma a
// fotograma, espera a que estén cargadas las teselas 3D, hace una captura y monta el MP4
// con ffmpeg. Así el vídeo sale fluido aunque el navegador renderice despacio.
//
//   FORMAT=horizontal|vertical  FPS=25  npx tsx scripts/video.mts
import { chromium, type Page } from 'playwright';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { buildTimeline, cameraAt } from '../src/tour/camera';
import type { Tour } from '../src/tour/tours';

const SITE = process.env.SITE_URL ?? 'https://jtorresestiguin-cloud.github.io/Gemelo-digital-VLC/';
const SHORT_URL = 'jtorresestiguin-cloud.github.io/Gemelo-digital-VLC';
const FORMAT = process.env.FORMAT === 'vertical' ? 'vertical' : 'horizontal';
const FPS = Number(process.env.FPS ?? 25);
const LIMIT = Number(process.env.MAX_SECONDS ?? 0); // para pruebas cortas
/** tamaño final del vídeo */
const SIZE = FORMAT === 'vertical' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
/** Se dibuja a menor resolución (sin GPU cada píxel cuesta) y ffmpeg lo escala al final. */
const K = Number(process.env.RENDER_SCALE ?? 2 / 3);
const RENDER = { width: Math.round(SIZE.width * K), height: Math.round(SIZE.height * K) };
const px = (n: number) => `${Math.round(n * K)}px`;
/** El vídeo se reparte en trozos que se dibujan en paralelo (una máquina por trozo). */
const SHARD = Number(process.env.SHARD ?? 0);
const SHARDS = Number(process.env.SHARDS ?? 1);
const OUT = 'video';
const FRAMES = `${OUT}/frames-${FORMAT}`;

// En vertical se ve menos de lado: la cámara se aleja un poco.
const dz = FORMAT === 'vertical' ? -0.45 : 0;
const stop = (name: string, subtitle: string, center: [number, number], zoom: number, pitch: number, bearing: number, hold: number) =>
  ({ name, subtitle, center, zoom: zoom + dz, pitch, bearing, hold });

export const VIDEO_TOUR: Tour = {
  id: 'video-redes',
  title: 'València en 3D',
  stops: [
    stop('València', 'Gemelo digital', [-0.3745, 39.4725], 13.4, 52, -20, 3.2),
    stop('Torres de Serranos', 'Puerta de la muralla medieval · 1392', [-0.37601, 39.47918], 17.2, 64, 160, 3),
    stop('Catedral y Miguelete', 'El campanario gótico de la ciudad', [-0.37540, 39.47550], 17.2, 66, 230, 3.2),
    stop('Lonja de la Seda', 'Patrimonio de la Humanidad · UNESCO', [-0.37840, 39.47441], 17.3, 64, 20, 3),
    stop('Plaza del Ayuntamiento', 'El corazón de la ciudad', [-0.37620, 39.46965], 16.9, 62, 330, 2.6),
    stop('Ciudad de las Artes y las Ciencias', 'Santiago Calatrava y Félix Candela', [-0.35250, 39.45590], 16.3, 64, 120, 4.5),
    stop('La Marina', 'Veles e Vents y el puerto', [-0.32428, 39.46103], 16.4, 62, 200, 3),
    stop('València', 'Gemelo digital', [-0.3600, 39.4685], 13.3, 52, 290, 4),
  ],
};

/** tsx (esbuild) añade __name() a las funciones que se envían a la página: lo definimos allí. */
const NAME_SHIM = 'window.__name = window.__name || ((f) => f);';

const CSS = `
.record-exit, .monument-popup, .maplibregl-popup, .guided-card, .tour-panel { display: none !important; }
.vid-layer { position: fixed; inset: 0; pointer-events: none; z-index: 9999; font-family: Inter, system-ui, sans-serif; color: #fff; }
.vid-shade { position: absolute; left: 0; right: 0; bottom: 0; height: 42%; background: linear-gradient(to top, rgba(2,6,23,.72), rgba(2,6,23,0)); }
.vid-title { position: absolute; left: ${px(FORMAT === 'vertical' ? 64 : 88)}; right: ${px(64)}; bottom: ${px(FORMAT === 'vertical' ? 300 : 120)}; }
.vid-kicker { font-size: ${px(FORMAT === 'vertical' ? 30 : 24)}; letter-spacing: .18em; text-transform: uppercase; color: #fbbf24; font-weight: 700; }
.vid-name { font-size: ${px(FORMAT === 'vertical' ? 84 : 76)}; font-weight: 800; line-height: 1.02; margin-top: ${px(10)}; text-shadow: 0 ${px(4)} ${px(24)} rgba(0,0,0,.45); }
.vid-sub { font-size: ${px(FORMAT === 'vertical' ? 40 : 34)}; margin-top: ${px(14)}; opacity: .92; text-shadow: 0 ${px(2)} ${px(12)} rgba(0,0,0,.5); }
.vid-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 ${px(80)};
  background: radial-gradient(ellipse at center, rgba(2,6,23,.55), rgba(2,6,23,.15) 70%); }
.vid-card .vid-name { font-size: ${px(FORMAT === 'vertical' ? 120 : 112)}; }
.vid-url { margin-top: ${px(28)}; font-size: ${px(FORMAT === 'vertical' ? 34 : 30)}; padding: ${px(14)} ${px(28)}; border-radius: 999px; background: rgba(15,23,42,.75); border: ${px(2)} solid rgba(251,191,36,.7); }
`;

/** Peticiones de teselas de Google en curso (para saber cuándo está cargada la vista). */
function trackTiles(page: Page) {
  let pending = 0;
  let last = Date.now();
  const isTile = (u: string) => u.includes('tile.googleapis.com');
  page.on('request', (r) => { if (isTile(r.url())) { pending++; last = Date.now(); } });
  const done = (r: { url(): string }) => { if (isTile(r.url())) { pending = Math.max(0, pending - 1); last = Date.now(); } };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return { get pending() { return pending; }, get quietMs() { return Date.now() - last; } };
}

/** Redibuja hasta que no quedan teselas pendientes (máx. `maxMs`). */
async function settle(page: Page, net: ReturnType<typeof trackTiles>, maxMs: number, quiet = 350) {
  const t0 = Date.now();
  let ok = 0;
  while (Date.now() - t0 < maxMs) {
    const loaded = await page.evaluate(() => new Promise<boolean>((resolve) => {
      const w = window as unknown as { __map: { triggerRepaint(): void }; __tileset?: { isLoaded?: () => boolean } };
      w.__map.triggerRepaint();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(w.__tileset?.isLoaded?.() ?? true)));
    }));
    ok = loaded && net.pending === 0 && net.quietMs > quiet ? ok + 1 : 0;
    if (ok >= 2) return true;
  }
  return false;
}

function overlayFor(t: number, total: number, frame: ReturnType<typeof cameraAt>) {
  const fade = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  if (t < 3.4) {
    const o = Math.min(fade(0.2, 1), 1 - fade(2.6, 3.4));
    return { mode: 'card', opacity: o, kicker: 'Gemelo digital', name: 'València en 3D', sub: 'Vuela por la ciudad fotorrealista', url: '' };
  }
  if (t > total - 4.2) {
    const o = fade(total - 4.2, total - 3.2);
    return { mode: 'card', opacity: o, kicker: 'Explóralo tú mismo', name: 'Gemelo Digital València', sub: 'Gratis, desde el móvil o el ordenador', url: SHORT_URL };
  }
  const s = VIDEO_TOUR.stops[frame.stopIndex];
  const first = frame.stopIndex === 0 || frame.stopIndex === VIDEO_TOUR.stops.length - 1;
  const p = frame.holdProgress;
  const inHold = !first && p > 0 && p < 1;
  const o = inHold ? Math.min(1, p / 0.18, (1 - p) / 0.18) : 0;
  return { mode: 'title', opacity: o, kicker: 'València · gemelo digital', name: s.name, sub: s.subtitle ?? '', url: '' };
}

async function renderMusic(seconds: number, file: string) {
  const { outputFiles } = await build({ entryPoints: ['src/tour/music.ts'], bundle: true, format: 'iife', globalName: 'Music', write: false });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addScriptTag({ content: NAME_SHIM + outputFiles[0].text });
  const b64 = await page.evaluate(async (dur) => {
    const rate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(rate * (dur + 0.5)), rate);
    (window as unknown as { Music: { playMusic: (c: BaseAudioContext, d: AudioNode[], s: number) => unknown } }).Music.playMusic(ctx, [ctx.destination], dur);
    const buf = await ctx.startRendering();
    const n = buf.length;
    const view = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); view.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, n * 4, true);
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    for (let i = 0; i < n; i++) {
      view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
      view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
    }
    let s = '';
    const bytes = new Uint8Array(view.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, seconds);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  await browser.close();
}

async function main() {
  mkdirSync(FRAMES, { recursive: true });
  const timeline = buildTimeline(VIDEO_TOUR);
  const total = LIMIT || timeline.duration;
  const nFrames = Math.round(total * FPS);
  const per = Math.ceil(nFrames / SHARDS);
  const from = SHARD * per;
  const to = Math.min(nFrames, from + per);
  console.log(`[${FORMAT}] ${total.toFixed(1)} s · fotogramas ${from}–${to - 1} de ${nFrames} · dibujo ${RENDER.width}×${RENDER.height}`);
  if (from >= to) return;

  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: RENDER, deviceScaleFactor: 1 });
  await page.addInitScript({ content: NAME_SHIM });
  const net = trackTiles(page);
  page.on('pageerror', (e) => console.log('error en la página:', e.message));
  await page.goto(`${SITE}?video=1`, { waitUntil: 'networkidle', timeout: 120_000 });
  // NO_PHOTOREAL=1 solo para probar el montaje en local, sin la ciudad de Google
  if (!process.env.NO_PHOTOREAL) await page.waitForFunction(() => (window as unknown as { __tileset?: unknown }).__tileset, null, { timeout: 180_000 });
  else await page.waitForFunction(() => (window as unknown as { __map?: unknown }).__map, null, { timeout: 60_000 });
  await page.keyboard.press('r'); // modo grabación: sin menús
  await page.addStyleTag({ content: CSS });
  await page.evaluate(() => {
    const w = window as unknown as { __map: { getLayer(id: string): unknown; setLayoutProperty(id: string, k: string, v: string): void } };
    for (const id of ['vlc-monuments', 'vlc-monuments-label']) if (w.__map.getLayer(id)) w.__map.setLayoutProperty(id, 'visibility', 'none');
    const layer = document.createElement('div');
    layer.className = 'vid-layer';
    layer.innerHTML = '<div class="vid-shade"></div><div class="vid-title"><div class="vid-kicker"></div><div class="vid-name"></div><div class="vid-sub"></div></div>'
      + '<div class="vid-card"><div class="vid-kicker"></div><div class="vid-name"></div><div class="vid-sub"></div><div class="vid-url"></div></div>';
    document.body.appendChild(layer);
  });

  // Precarga: el primer fotograma del trozo, con tiempo de sobra para llenar la caché
  const first = cameraAt(VIDEO_TOUR, timeline, from / FPS).camera;
  await page.evaluate((c) => { (window as unknown as { __map: { jumpTo(o: unknown): void } }).__map.jumpTo(c); }, first);
  console.log('precarga', (await settle(page, net, 120_000, 1500)) ? 'ok' : 'incompleta');

  const t0 = Date.now();
  let incomplete = 0;
  for (let i = from; i < to; i++) {
    const t = i / FPS;
    const frame = cameraAt(VIDEO_TOUR, timeline, t);
    const ov = overlayFor(t, total, frame);
    await page.evaluate(({ cam, ov }) => {
      (window as unknown as { __map: { jumpTo(o: unknown): void } }).__map.jumpTo(cam);
      const title = document.querySelector<HTMLElement>('.vid-title')!;
      const card = document.querySelector<HTMLElement>('.vid-card')!;
      const shade = document.querySelector<HTMLElement>('.vid-shade')!;
      const el = ov.mode === 'card' ? card : title;
      title.style.opacity = ov.mode === 'title' ? String(ov.opacity) : '0';
      card.style.opacity = ov.mode === 'card' ? String(ov.opacity) : '0';
      shade.style.opacity = ov.mode === 'title' ? String(ov.opacity) : '0';
      el.style.transform = `translateY(${(1 - ov.opacity) * 18}px)`;
      el.querySelector('.vid-kicker')!.textContent = ov.kicker;
      el.querySelector('.vid-name')!.textContent = ov.name;
      el.querySelector('.vid-sub')!.textContent = ov.sub;
      const url = el.querySelector<HTMLElement>('.vid-url');
      if (url) { url.textContent = ov.url; url.style.display = ov.url ? '' : 'none'; }
    }, { cam: frame.camera, ov });
    if (!(await settle(page, net, 20_000))) incomplete++;
    await page.screenshot({ path: `${FRAMES}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94, timeout: 180_000 });
    if ((i - from) % 10 === 0) {
      const el = (Date.now() - t0) / 1000;
      const done = i - from + 1;
      console.log(`fotograma ${i} (${done}/${to - from}) · ${(el / done).toFixed(1)} s/fotograma · faltan ~${((el / done) * (to - i - 1) / 60).toFixed(0)} min · incompletos ${incomplete}`);
    }
  }
  await browser.close();
  console.log(`trozo ${SHARD + 1}/${SHARDS} listo · incompletos ${incomplete}`);
}

/** Une los fotogramas de todos los trozos, añade la música y escala al tamaño final. */
async function assemble() {
  const timeline = buildTimeline(VIDEO_TOUR);
  const total = LIMIT || timeline.duration;
  const nFrames = Math.round(total * FPS);
  // si falta algún fotograma (un trozo falló), se repite el anterior para no descuadrar el tiempo
  let missing = 0;
  let last = '';
  for (let i = 0; i < nFrames; i++) {
    const f = `${FRAMES}/f${String(i).padStart(5, '0')}.jpg`;
    if (existsSync(f)) last = f;
    else if (last) { copyFileSync(last, f); missing++; }
  }
  console.log(`[${FORMAT}] ${nFrames} fotogramas · rellenados ${missing}`);
  const cover = Math.min(nFrames - 1, Math.round((timeline.segments.find((s) => s.kind === 'hold' && s.index === 5)!.start + 2) * FPS));
  const scale = `scale=${SIZE.width}:${SIZE.height}:flags=lanczos`;
  execFileSync('ffmpeg', ['-y', '-i', `${FRAMES}/f${String(cover).padStart(5, '0')}.jpg`, '-vf', scale, '-q:v', '2', `${OUT}/portada-${FORMAT}.jpg`], { stdio: 'inherit' });

  console.log('música…');
  await renderMusic(total, `${OUT}/musica.wav`);
  const out = `${OUT}/gemelo-digital-valencia-${FORMAT}.mp4`;
  execFileSync('ffmpeg', [
    '-y', '-framerate', String(FPS), '-i', `${FRAMES}/f%05d.jpg`, '-i', `${OUT}/musica.wav`,
    '-vf', scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
  ], { stdio: 'inherit' });
  console.log('vídeo listo:', out);
}

(process.env.MUSIC_ONLY ? (mkdirSync(OUT, { recursive: true }), renderMusic(6, `${OUT}/musica-prueba.wav`))
  : process.env.MODE === 'assemble' ? assemble() : main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
