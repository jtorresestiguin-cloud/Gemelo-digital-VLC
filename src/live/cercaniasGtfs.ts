/**
 * Cercanías València a partir del GTFS oficial de Renfe (ssl.renfe.com/ftransit/Fichero_CER_FOMENTO).
 * Se usa al generar public/data/cercanias-vlc.json (scripts/build-cercanias.ts); no se ejecuta en el navegador.
 *  - Núcleo de València: los identificadores de ruta y de viaje empiezan por «40».
 *  - Solo trenes (route_type 2); los autobuses de servicio alternativo (route_type 3) se omiten.
 */

export type Row = Record<string, string>;

/** CSV del GTFS de Renfe: sin comillas, con relleno de espacios en cabeceras y valores. */
export function parseCsv(text: string): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const keys = lines[0].split(',').map((k) => k.trim());
  return lines.slice(1).map((l) => {
    const v = l.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, (v[i] ?? '').trim()]));
  });
}

export const VLC_PREFIX = '40';

export interface CerLine { line: string; color: string; name: string; coords: [number, number][][] }
export interface CerStation { id: string; name: string; at: [number, number]; lines: string[] }
export interface CercaniasData { built: string; lines: CerLine[]; stations: CerStation[] }

/** Distancia aproximada en metros (suficiente para simplificar trazados). */
const meters = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 85_960, (a[1] - b[1]) * 111_130);

/** Quita puntos casi alineados: conserva uno cada `step` metros como mínimo, y siempre el último. */
export function thin(coords: [number, number][], step = 25): [number, number][] {
  if (coords.length <= 2) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) if (meters(out[out.length - 1], coords[i]) >= step) out.push(coords[i]);
  out.push(coords[coords.length - 1]);
  return out.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}

/** Nombre legible de la línea: «València Nord – Gandia» a partir del route_long_name más frecuente. */
const lineName = (long: string) => long.split(/\s+-(?=\S)/).map((s) => s.trim()).filter(Boolean).join(' – ');

/**
 * Construye líneas (con su trazado y color oficial) y estaciones (con las líneas que paran en ellas).
 * `stopTimes` se recorre como iterable para no cargar en memoria los ~280 MB del fichero de horarios.
 */
export function buildCercanias(input: {
  routes: Row[]; trips: Row[]; stops: Row[]; shapes: Row[]; stopTimes: Iterable<{ trip_id: string; stop_id: string }>; built?: string;
}): CercaniasData {
  const routes = new Map(input.routes.filter((r) => r.route_id.startsWith(VLC_PREFIX) && r.route_type === '2').map((r) => [r.route_id, r]));
  const tripLine = new Map<string, string>();
  const shapeLine = new Map<string, string>();
  const tripsPerRoute = new Map<string, number>();
  for (const t of input.trips) {
    const r = routes.get(t.route_id);
    if (!r) continue;
    tripLine.set(t.trip_id, r.route_short_name);
    if (t.shape_id) shapeLine.set(t.shape_id, r.route_short_name);
    tripsPerRoute.set(t.route_id, (tripsPerRoute.get(t.route_id) ?? 0) + 1);
  }

  // estaciones con servicio y líneas que paran
  const stopLines = new Map<string, Set<string>>();
  for (const st of input.stopTimes) {
    const line = tripLine.get(st.trip_id);
    if (!line) continue;
    (stopLines.get(st.stop_id) ?? stopLines.set(st.stop_id, new Set()).get(st.stop_id)!).add(line);
  }
  const byLine = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });
  const stations: CerStation[] = input.stops
    .filter((s) => stopLines.has(s.stop_id))
    .map((s) => ({ id: s.stop_id, name: s.stop_name, at: [Math.round(+s.stop_lon * 1e5) / 1e5, Math.round(+s.stop_lat * 1e5) / 1e5] as [number, number], lines: [...stopLines.get(s.stop_id)!].sort(byLine) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // trazados
  const pts = new Map<string, { seq: number; at: [number, number] }[]>();
  for (const p of input.shapes) {
    if (!shapeLine.has(p.shape_id)) continue;
    (pts.get(p.shape_id) ?? pts.set(p.shape_id, []).get(p.shape_id)!).push({ seq: +p.shape_pt_sequence, at: [+p.shape_pt_lon, +p.shape_pt_lat] });
  }
  const lines = new Map<string, CerLine>();
  const best = new Map<string, number>();
  for (const [id, r] of routes) {
    const n = tripsPerRoute.get(id) ?? 0;
    if (!n) continue;
    const line = r.route_short_name;
    if (!lines.has(line)) lines.set(line, { line, color: `#${r.route_color || '64748b'}`, name: '', coords: [] });
    if (n > (best.get(line) ?? -1)) { best.set(line, n); lines.get(line)!.name = lineName(r.route_long_name); }
  }
  for (const [shape, line] of shapeLine) {
    const p = pts.get(shape);
    if (p && lines.has(line)) lines.get(line)!.coords.push(thin(p.sort((a, b) => a.seq - b.seq).map((q) => q.at)));
  }
  return { built: input.built ?? new Date().toISOString().slice(0, 10), lines: [...lines.values()].sort((a, b) => byLine(a.line, b.line)), stations };
}

/* ───────────── Horarios por estación ───────────── */

/**
 * Horario compacto de los próximos días:
 *  - dates: días cubiertos (AAAA-MM-DD, hora de Madrid)
 *  - trips: [línea, destino, días en que circula (máscara de bits sobre `dates`), id del viaje GTFS]
 *  - stops: por estación, pares [índice del viaje, minuto de salida desde las 00:00 del día de servicio] ordenados
 *    (puede pasar de 1440 en trenes que salen después de medianoche)
 */
export interface CerTimetable {
  built: string;
  dates: string[];
  trips: [line: string, to: string, days: number, trip: string][];
  stops: Record<string, [trip: number, min: number][]>;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** AAAA-MM-DD + n días (sin depender de la zona horaria del equipo). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function buildTimetable(input: {
  routes: Row[]; trips: Row[]; stops: Row[]; calendar: Row[];
  stopTimes: { trip_id: string; stop_id: string; departure_time: string; stop_sequence: string }[];
  from: string; days: number;
}): CerTimetable {
  const dates = Array.from({ length: input.days }, (_, i) => addDays(input.from, i));
  const routes = new Map(input.routes.filter((r) => r.route_id.startsWith(VLC_PREFIX) && r.route_type === '2').map((r) => [r.route_id, r]));
  const mask = new Map<string, number>();
  for (const c of input.calendar) {
    let m = 0;
    dates.forEach((d, i) => {
      const ymd = d.replace(/-/g, '');
      const wd = WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
      if (c.start_date <= ymd && ymd <= c.end_date && c[wd] === '1') m |= 1 << i;
    });
    if (m) mask.set(c.service_id, m);
  }
  const name = new Map(input.stops.map((s) => [s.stop_id, s.stop_name]));
  const tripInfo = new Map<string, { line: string; days: number }>();
  for (const t of input.trips) {
    const r = routes.get(t.route_id);
    const days = mask.get(t.service_id);
    if (r && days) tripInfo.set(t.trip_id, { line: r.route_short_name, days });
  }
  // paradas de cada viaje en orden
  const seq = new Map<string, { stop: string; min: number; n: number }[]>();
  for (const st of input.stopTimes) {
    if (!tripInfo.has(st.trip_id)) continue;
    (seq.get(st.trip_id) ?? seq.set(st.trip_id, []).get(st.trip_id)!).push({ stop: st.stop_id, min: toMin(st.departure_time), n: +st.stop_sequence });
  }
  const out: CerTimetable = { built: input.from, dates, trips: [], stops: {} };
  for (const [trip, calls] of seq) {
    calls.sort((a, b) => a.n - b.n);
    const last = calls[calls.length - 1];
    const info = tripInfo.get(trip)!;
    const idx = out.trips.push([info.line, name.get(last.stop) ?? '', info.days, trip]) - 1;
    // en la última parada el tren termina: no es una salida
    for (const c of calls.slice(0, -1)) (out.stops[c.stop] ??= []).push([idx, c.min]);
  }
  for (const list of Object.values(out.stops)) list.sort((a, b) => a[1] - b[1]);
  return out;
}

export interface Departure {
  line: string; to: string; trip: string;
  /** minuto programado desde las 00:00 de hoy */
  min: number;
  /** retraso en vivo (min), si se conoce */
  delay?: number;
}

/**
 * Próximas salidas de una estación a partir de `date` + `nowMin` (hora de Madrid).
 * Incluye los trenes del día anterior que salen pasada la medianoche.
 */
export function nextDepartures(tt: CerTimetable, stop: string, date: string, nowMin: number, n = 6, delays?: Map<string, number>, horizon = 180): Departure[] {
  const list = tt.stops[stop] ?? [];
  const out: Departure[] = [];
  for (const [offset, d] of [[-1440, addDays(date, -1)], [0, date]] as const) {
    const di = tt.dates.indexOf(d);
    if (di < 0) continue;
    for (const [ti, m] of list) {
      const t = tt.trips[ti];
      const min = m + offset;
      if (!(t[2] & (1 << di)) || min < nowMin - 90 || min > nowMin + horizon) continue;
      const delay = delays?.get(t[3]);
      // un tren con retraso aún no ha salido aunque su hora programada ya haya pasado
      if (min + (delay ?? 0) < nowMin) continue;
      out.push({ line: t[0], to: t[1], trip: t[3], min, ...(delay !== undefined ? { delay } : {}) });
    }
  }
  return out.sort((a, b) => a.min + (a.delay ?? 0) - (b.min + (b.delay ?? 0))).slice(0, n);
}
