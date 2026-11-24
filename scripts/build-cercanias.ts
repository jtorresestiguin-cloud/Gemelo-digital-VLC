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
import { buildCercanias, parseCsv, VLC_PREFIX } from '../src/live/cercaniasGtfs';

const GTFS = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';

async function main() {
  let dir = process.argv[2];
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), 'cercanias-'));
    const r = await fetch(GTFS, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36' } });
    if (!r.ok) throw new Error(`GTFS: HTTP ${r.status}`);
    writeFileSync(join(dir, 'gtfs.zip'), Buffer.from(await r.arrayBuffer()));
    execFileSync('unzip', ['-q', '-o', 'gtfs.zip', 'routes.txt', 'trips.txt', 'stops.txt', 'shapes.txt', 'stop_times.txt'], { cwd: dir });
  }
  const read = (f: string) => parseCsv(readFileSync(join(dir!, f), 'utf8'));

  // stop_times pesa ~280 MB: se lee línea a línea y solo se guardan los viajes del núcleo de València
  const stopTimes: { trip_id: string; stop_id: string }[] = [];
  let keys: string[] | undefined;
  for await (const line of createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) })) {
    if (!keys) { keys = line.replace(/^﻿/, '').split(',').map((k) => k.trim()); continue; }
    if (!line.startsWith(VLC_PREFIX)) continue;
    const v = line.split(',');
    stopTimes.push({ trip_id: v[keys.indexOf('trip_id')].trim(), stop_id: v[keys.indexOf('stop_id')].trim() });
  }

  const data = buildCercanias({ routes: read('routes.txt'), trips: read('trips.txt'), stops: read('stops.txt'), shapes: read('shapes.txt'), stopTimes });
  if (data.lines.length < 3 || data.stations.length < 20) throw new Error(`Datos sospechosos: ${data.lines.length} líneas, ${data.stations.length} estaciones`);
  const out = 'public/data/cercanias-vlc.json';
  writeFileSync(out, JSON.stringify(data));
  console.log(`${out}: ${data.lines.map((l) => `${l.line} (${l.name}, ${l.coords.reduce((n, c) => n + c.length, 0)} puntos)`).join(' · ')}; ${data.stations.length} estaciones`);
}

main().catch((e) => { console.error(e); process.exit(1); });
