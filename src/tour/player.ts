/**
 * Reproduce un recorrido moviendo la cámara del mapa y, opcionalmente, lo graba a vídeo
 * (con rótulos y atribuciones incrustados) y le añade la música generada.
 */
import type { Map as MlMap } from 'maplibre-gl';
import { buildTimeline, cameraAt, type TourFrame } from './camera';
import { playMusic, type MusicHandle } from './music';
import type { Tour } from './tours';

export type VideoQuality = '720p' | '1080p';

export interface PlayOptions {
  record: boolean;
  music: boolean;
  quality: VideoQuality;
  /** texto de atribución que debe aparecer en el vídeo (OpenStreetMap, Google…) */
  attribution: () => string;
  onFrame: (frame: TourFrame, seconds: number, total: number) => void;
  onStatus?: (text: string) => void;
}

export interface TourHandle {
  stop(): void;
  /** vídeo grabado (si se pidió) cuando termina o se detiene */
  done: Promise<{ blob: Blob; extension: string } | null>;
}

/** Formato de vídeo: MP4 si el navegador sabe grabarlo, si no WebM. */
export function pickMimeType(isSupported: (t: string) => boolean = (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)): { mime: string; extension: string } | null {
  // MP4 solo con H.264 (el formato que aceptan iPhone, QuickTime y las redes sociales);
  // un MP4 genérico puede llevar VP9 dentro y no reproducirse en muchos sitios.
  const candidates: [string, string][] = [
    ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  const found = candidates.find(([m]) => isSupported(m));
  return found ? { mime: found[0], extension: found[1] } : null;
}

const SIZES: Record<VideoQuality, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

function waitIdle(map: MlMap, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (map.loaded() && map.areTilesLoaded()) return resolve();
    const t = setTimeout(done, maxMs);
    function done() {
      clearTimeout(t);
      map.off('idle', done);
      resolve();
    }
    map.once('idle', done);
  });
}

/** Rótulo inferior con fundido (lo mismo que se ve en pantalla). */
function drawTitle(g: CanvasRenderingContext2D, w: number, h: number, name: string, subtitle: string | undefined, alpha: number) {
  if (alpha <= 0.01) return;
  const s = h / 1080;
  g.save();
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(0, h * 0.62, 0, h);
  grad.addColorStop(0, 'rgba(5,10,20,0)');
  grad.addColorStop(1, 'rgba(5,10,20,0.75)');
  g.fillStyle = grad;
  g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = '#f97316';
  g.fillRect(96 * s, h - 230 * s, 72 * s, 6 * s);
  g.fillStyle = '#ffffff';
  g.font = `700 ${64 * s}px Inter, system-ui, sans-serif`;
  g.fillText(name, 96 * s, h - 150 * s, w - 192 * s);
  if (subtitle) {
    g.fillStyle = 'rgba(226,232,240,0.9)';
    g.font = `400 ${32 * s}px Inter, system-ui, sans-serif`;
    g.fillText(subtitle, 96 * s, h - 100 * s, w - 192 * s);
  }
  g.restore();
}

export function playTour(map: MlMap, tour: Tour, opts: PlayOptions): TourHandle {
  const timeline = buildTimeline(tour);
  let stopped = false;
  let raf = 0;
  let audio: AudioContext | undefined;
  let music: MusicHandle | undefined;
  let recorder: MediaRecorder | undefined;
  let finish: (v: { blob: Blob; extension: string } | null) => void = () => {};
  const done = new Promise<{ blob: Blob; extension: string } | null>((res) => (finish = res));
  const chunks: Blob[] = [];
  let onRender: (() => void) | undefined;
  let current: TourFrame | undefined;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    if (onRender) map.off('render', onRender);
    music?.stop();
    setTimeout(() => audio?.close().catch(() => {}), 1800);
    map.dragPan.enable(); map.scrollZoom.enable(); map.dragRotate.enable(); map.touchZoomRotate.enable();
  };

  const run = async () => {
    // durante el recorrido el usuario no mueve la cámara
    map.dragPan.disable(); map.scrollZoom.disable(); map.dragRotate.disable(); map.touchZoomRotate.disable();

    if (opts.record) {
      // precarga: visita cada parada para que la ciudad esté cargada al grabar
      for (let i = 0; i < tour.stops.length && !stopped; i++) {
        opts.onStatus?.(`Preparando la grabación: cargando ${tour.stops[i].name} (${i + 1}/${tour.stops.length})…`);
        const s = tour.stops[i];
        map.jumpTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing });
        await waitIdle(map, 5000);
      }
    }
    if (stopped) return;

    if (opts.music || opts.record) {
      try {
        audio = new AudioContext();
        await audio.resume();
      } catch {
        audio = undefined;
      }
    }
    const audioDest = opts.record && audio ? audio.createMediaStreamDestination() : undefined;
    if (opts.music && audio) {
      const outs: AudioNode[] = [audio.destination];
      if (audioDest) outs.push(audioDest);
      music = playMusic(audio, outs, timeline.duration);
    }

    if (opts.record) {
      const fmt = pickMimeType();
      if (!fmt) throw new Error('Este navegador no permite grabar vídeo (MediaRecorder). Prueba con Chrome o Edge.');
      const [w, h] = SIZES[opts.quality];
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const g = out.getContext('2d')!;
      const src = map.getCanvas();
      // el lienzo WebGL se copia justo después de cada dibujado del mapa
      onRender = () => {
        const sw = src.width, sh = src.height;
        const scale = Math.max(w / sw, h / sh);
        const dw = sw * scale, dh = sh * scale;
        g.fillStyle = '#0a101c';
        g.fillRect(0, 0, w, h);
        g.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
        if (current) {
          const stop = tour.stops[current.stopIndex];
          const p = current.holdProgress;
          const alpha = Math.min(1, p * 4, (1 - p) * 4 + (current.stopIndex === tour.stops.length - 1 ? 1 : 0));
          if (stop) drawTitle(g, w, h, stop.name, stop.subtitle, alpha);
        }
        const s = h / 1080;
        g.font = `600 ${26 * s}px Inter, system-ui, sans-serif`;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillText('Gemelo Digital València', 48 * s, 64 * s);
        g.font = `400 ${18 * s}px Inter, system-ui, sans-serif`;
        g.fillStyle = 'rgba(255,255,255,0.75)';
        const attrib = opts.attribution();
        g.textAlign = 'right';
        g.fillText(attrib, w - 32 * s, h - 24 * s, w * 0.8);
        g.textAlign = 'left';
      };
      map.on('render', onRender);
      const stream = out.captureStream(30);
      audioDest?.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      recorder = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: opts.quality === '1080p' ? 12_000_000 : 6_000_000 });
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => finish(chunks.length ? { blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), extension: fmt.extension } : null);
      recorder.start(1000);
    }

    opts.onStatus?.('');
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / 1000;
      current = cameraAt(tour, timeline, t);
      map.jumpTo(current.camera);
      opts.onFrame(current, Math.min(t, timeline.duration), timeline.duration);
      if (current.done || stopped) {
        cleanup();
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        else finish(null);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  run().catch((e) => {
    cleanup();
    opts.onStatus?.(e instanceof Error ? e.message : String(e));
    finish(null);
  });

  return {
    stop() {
      stopped = true;
      if (!raf) {
        cleanup();
        finish(null);
      }
    },
    done,
  };
}
