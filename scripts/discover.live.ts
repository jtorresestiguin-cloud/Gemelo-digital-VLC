// Exploración temporal: ¿alguna fuente de Cercanías en vivo admite CORS? (se borra tras usarla)
import { test } from 'vitest';
const O = 'https://jtorresestiguin-cloud.github.io';
test('cors', async () => {
  for (const u of ['https://tiempo-real.renfe.com/renfe-visor/flota.json', 'https://gtfsrt.renfe.com/vehicle_positions.json', 'https://gtfsrt.renfe.com/alerts.json']) {
    for (const method of ['GET', 'OPTIONS']) {
      try {
        const r = await fetch(u, { method, headers: { Origin: O, 'Access-Control-Request-Method': 'GET' } });
        const h = [...r.headers].filter(([k]) => /access-control|cache|server|age/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ');
        console.log(`### ${method} ${u} ${r.status} ${h}`);
      } catch (e) { console.log(`### ${method} ${u} ERR ${e}`); }
    }
  }
});
