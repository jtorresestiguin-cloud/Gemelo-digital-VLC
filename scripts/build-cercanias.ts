/**
 * Genera public/data/cercanias-vlc.json (líneas y estaciones de Cercanías València) desde el GTFS oficial de Renfe.
 * Uso: npx tsx scripts/build-cercanias.ts            (descarga el GTFS; necesita `unzip`)
 *      npx tsx scripts/build-cercanias.ts <carpeta>   (usa un GTFS ya descomprimido)
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { buildCercanias, buildTimetable, parseCsv, VLC_PREFIX } from '../src/live/cercaniasGtfs';

const GTFS = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';

async function main() {
  let dir = process.argv[2];
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), 'cercanias-'));
    const r = await fetch(GTFS, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36' } });
    if (!r.ok) throw new Error(`GTFS: HTTP ${r.status}`);
    writeFileSync(join(dir, 'gtfs.zip'), Buffer.from(await r.arrayBuffer()));
    execFileSync('unzip', ['-q', '-o', 'gtfs.zip', 'routes.txt', 'trips.txt', 'stops.txt', 'shapes.txt', 'stop_times.txt', 'calendar.txt'], { cwd: dir });
  }
  const read = (f: string) => parseCsv(readFileSync(join(dir!, f), 'utf8'));

  // stop_times pesa ~280 MB: se lee línea a línea y solo se guardan los viajes del núcleo de València
  const stopTimes: { trip_id: string; stop_id: string; departure_time: string; stop_sequence: string }[] = [];
  let keys: string[] | undefined;
  for await (const line of createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) })) {
    if (!keys) { keys = line.replace(/^﻿/, '').split(',').map((k) => k.trim()); continue; }
    if (!line.startsWith(VLC_PREFIX)) continue;
    const v = line.split(',');
    const col = (k: string) => (v[keys!.indexOf(k)] ?? '').trim();
    stopTimes.push({ trip_id: col('trip_id'), stop_id: col('stop_id'), departure_time: col('departure_time'), stop_sequence: col('stop_sequence') });
  }

  const routes = read('routes.txt');
  const trips = read('trips.txt');
  const stops = read('stops.txt');
  const data = buildCercanias({ routes, trips, stops, shapes: read('shapes.txt'), stopTimes });
  if (data.lines.length < 3 || data.stations.length < 20) throw new Error(`Datos sospechosos: ${data.lines.length} líneas, ${data.stations.length} estaciones`);
  const out = 'public/data/cercanias-vlc.json';
  writeFileSync(out, JSON.stringify(data));
  // horario de hoy y los 7 días siguientes (hora de Madrid); se regenera en cada publicación de la web
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const tt = buildTimetable({ routes, trips, stops, calendar: read('calendar.txt'), stopTimes, from: today, days: 8 });
  const calls = Object.values(tt.stops).reduce((n, l) => n + l.length, 0);
  if (!tt.trips.length) throw new Error(`Horario vacío para ${today}`);
  writeFileSync('public/data/cercanias-horarios.json', JSON.stringify(tt));
  console.log(`horarios desde ${today}: ${tt.trips.length} viajes, ${calls} salidas en ${Object.keys(tt.stops).length} estaciones`);
  console.log(`${out}: ${data.lines.map((l) => `${l.line} (${l.name}, ${l.coords.reduce((n, c) => n + c.length, 0)} puntos)`).join(' · ')}; ${data.stations.length} estaciones`);
}

main().catch((e) => { console.error(e); process.exit(1); });
