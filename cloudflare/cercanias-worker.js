/**
 * Intermediario gratuito (Cloudflare Workers) para los Cercanías de València en tiempo real.
 *
 * Renfe publica la posición de los trenes, sus retrasos y los avisos (GTFS-Realtime, licencia CC BY 4.0)
 * pero no deja que una web los lea directamente desde el navegador (no envía cabeceras CORS).
 * Este pequeño servicio los descarga, se queda solo con el núcleo de València y los devuelve a la web.
 *  - No guarda nada ni recibe datos del visitante: solo lee tres ficheros públicos de Renfe.
 *  - Respuesta en caché 20 s para no sobrecargar a Renfe aunque haya muchos visitantes.
 *
 * Despliegue: Cloudflare → Workers & Pages → Create → «Hello World» → Edit code → pegar este fichero → Deploy.
 */

const FEEDS = {
  vehicles: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  trips: 'https://gtfsrt.renfe.com/trip_updates.json',
  alerts: 'https://gtfsrt.renfe.com/alerts.json',
};
/** Núcleo de Cercanías València: sus viajes y rutas empiezan por «40». */
const VLC = '40';
const CACHE_SECONDS = 20;

/** «4027M24026C2» → «C2» */
export const lineOf = (id) => (String(id).match(/(C\d+[a-z]?|T\d+)$/i)?.[1] ?? '').replace(/[a-z]$/, '').toUpperCase();

/** Reduce los tres ficheros de Renfe a lo que necesita el mapa. */
export function buildPayload(vehicles, trips, alerts, now = Date.now()) {
  const delays = new Map();
  let cancelled = 0;
  for (const e of trips?.entity ?? []) {
    const tu = e.tripUpdate;
    const id = tu?.trip?.tripId;
    if (!id || !String(id).startsWith(VLC)) continue;
    if (tu.trip.scheduleRelationship === 'CANCELED') { cancelled++; continue; }
    const d = Number(tu.delay ?? tu.stopTimeUpdate?.[0]?.arrival?.delay);
    if (Number.isFinite(d)) delays.set(id, d);
  }
  const trains = [];
  for (const e of vehicles?.entity ?? []) {
    const v = e.vehicle;
    const id = v?.trip?.tripId;
    const lat = Number(v?.position?.latitude);
    const lng = Number(v?.position?.longitude);
    if (!id || !String(id).startsWith(VLC) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const label = String(v.vehicle?.label ?? '');
    const platform = label.match(/PLATF\.\((\w+)\)/)?.[1] ?? '';
    const delay = delays.get(id);
    trains.push({
      id: String(v.vehicle?.id ?? id), trip: id, line: lineOf(id), lng: Math.round(lng * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5,
      status: v.currentStatus ?? '', stop: String(v.stopId ?? ''), platform,
      delay: delay === undefined ? null : Math.round(delay / 60), at: Number(v.timestamp) * 1000 || now,
    });
  }
  const seen = new Set();
  const notices = [];
  for (const e of alerts?.entity ?? []) {
    const a = e.alert;
    const lines = [...new Set((a?.informedEntity ?? []).map((x) => x.routeId).filter((r) => r && String(r).startsWith(VLC)).map(lineOf).filter(Boolean))].sort();
    if (!lines.length) continue;
    const period = a.activePeriod ?? [];
    const active = !period.length || period.some((p) => (!p.start || Number(p.start) * 1000 <= now) && (!p.end || Number(p.end) * 1000 >= now));
    if (!active) continue;
    // la primera traducción es la castellana (la valenciana viene después, también marcada «es»)
    const raw = a.descriptionText?.translation?.[0]?.text ?? a.headerText?.translation?.[0]?.text ?? '';
    const text = String(raw).replace(/https?:\/\/\S+/g, '').replace(/^#+/, '').replace(/\s*(Más información|Consulte los horarios en)\s*:?\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    notices.push({ lines, text });
  }
  return { updated: Number(vehicles?.header?.timestamp) * 1000 || now, trains, cancelled, notices };
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Content-Type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, _env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Solo GET', { status: 405, headers: CORS });
    const cache = caches.default;
    const key = new Request(new URL('/cercanias-vlc', request.url).toString());
    const hit = await cache.match(key);
    if (hit) return hit;
    try {
      const get = async (u) => {
        const r = await fetch(u, { cf: { cacheTtl: CACHE_SECONDS } });
        if (!r.ok) throw new Error(`Renfe ${r.status}`);
        return r.json();
      };
      const [vehicles, trips, alerts] = await Promise.all([get(FEEDS.vehicles), get(FEEDS.trips), get(FEEDS.alerts).catch(() => null)]);
      const res = new Response(JSON.stringify(buildPayload(vehicles, trips, alerts)), {
        headers: { ...CORS, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
      });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 502, headers: CORS });
    }
  },
};
