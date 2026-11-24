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
