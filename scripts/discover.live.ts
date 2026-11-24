// Exploración temporal: Cercanías Renfe en València (se borra tras usarla)
import { test } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const inVlc = (lat: number, lon: number) => lat > 38.9 && lat < 40.1 && lon > -1.2 && lon < 0.3;

test('cercanías realtime', async () => {
  for (const f of ['vehicle_positions', 'trip_updates', 'alerts']) {
    for (const ext of ['json', 'pb']) {
      const u = `https://gtfsrt.renfe.com/${f}.${ext}`;
      try {
        const r = await fetch(u, { headers: { Origin: 'https://jtorresestiguin-cloud.github.io' } });
        const b = await r.arrayBuffer();
        console.log(`### ${u} ${r.status} ${r.headers.get('content-type')} acao=${r.headers.get('access-control-allow-origin')} bytes=${b.byteLength}`);
        if (ext !== 'json' || !r.ok) continue;
        const j = JSON.parse(new TextDecoder().decode(b));
        const ents = j.entity ?? [];
        console.log(`header ${JSON.stringify(j.header)} n=${ents.length}`);
        if (f === 'vehicle_positions') {
          const v = ents.filter((e: any) => inVlc(e.vehicle?.position?.latitude, e.vehicle?.position?.longitude));
          console.log(`VLC vehicles ${v.length}`); console.log(JSON.stringify(v.slice(0, 3), null, 1));
        } else if (f === 'trip_updates') {
          console.log(JSON.stringify(ents.slice(0, 2), null, 1));
          const ids = ents.map((e: any) => e.tripUpdate?.trip?.tripId ?? e.id);
          console.log('sample ids', ids.slice(0, 30).join(' '));
          console.log('ids with 40T', ids.filter((x: string) => /^40/.test(String(x))).slice(0, 20).join(' '));
        } else {
          const a = ents.filter((e: any) => /valen/i.test(JSON.stringify(e)));
          console.log(`alerts valencia ${a.length}`); console.log(JSON.stringify(a.slice(0, 3), null, 1).slice(0, 3000));
        }
      } catch (e) { console.log(`### ${u} ERR ${e}`); }
    }
  }
  for (const u of ['https://gtfsrt.renfe.com/vehicle_positions_LD.json', 'https://tiempo-real.renfe.com/renfe-visor/flota.json', 'https://tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json']) {
    try { const r = await fetch(u, { headers: UA }); const t = await r.text(); console.log(`### ${u} ${r.status} acao=${r.headers.get('access-control-allow-origin')} len=${t.length} ${t.slice(0, 400)}`); } catch (e) { console.log(`### ${u} ERR ${e}`); }
  }
});

test('cercanías gtfs estático', async () => {
  const u = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';
  const r = await fetch(u, { headers: UA });
  console.log(`### ${u} ${r.status} ${r.headers.get('content-type')} acao=${r.headers.get('access-control-allow-origin')}`);
  if (!r.ok) return;
  writeFileSync('/tmp/cer.zip', Buffer.from(await r.arrayBuffer()));
  execSync('rm -rf /tmp/cer && mkdir /tmp/cer && cd /tmp/cer && unzip -q ../cer.zip && ls -la && head -3 *.txt', { stdio: 'inherit' });
  const csv = (n: string) => { const [h, ...rows] = readFileSync(`/tmp/cer/${n}`, 'utf8').trim().split(/\r?\n/); const k = h.split(','); return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [k[i], v.trim()]))); };
  const stops = csv('stops.txt').filter((s) => inVlc(+s.stop_lat, +s.stop_lon));
  console.log(`VLC stops ${stops.length}`); console.log(stops.map((s) => `${s.stop_id}:${s.stop_name}`).join(' | '));
  const routes = csv('routes.txt');
  const vr = routes.filter((r) => /^40/.test(r.route_id) || /valen/i.test(JSON.stringify(r)));
  console.log(`routes total ${routes.length}; VLC-ish ${vr.length}`); console.log(JSON.stringify(vr.slice(0, 30)));
  console.log('route_id prefixes', [...new Set(routes.map((r) => r.route_id.slice(0, 2)))].join(' '));
  if (existsSync('/tmp/cer/shapes.txt')) console.log('has shapes');
  const trips = csv('trips.txt');
  const vt = trips.filter((t) => vr.some((r) => r.route_id === t.route_id));
  console.log(`trips VLC ${vt.length}`, JSON.stringify(vt.slice(0, 3)));
  console.log('calendar head'); execSync('head -3 /tmp/cer/calendar*.txt; wc -l /tmp/cer/*.txt', { stdio: 'inherit' });
});
