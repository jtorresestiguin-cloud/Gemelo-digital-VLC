/**
 * Fichas descriptivas de los servicios públicos de la ciudad de València.
 *
 * Proceden del «Mapa de Servicios Públicos CV» (inventario construido con fuentes
 * oficiales: Ajuntament, Generalitat, AEAT…): dirección, administración responsable,
 * contacto, horario, cita previa, trámites y accesibilidad. Se guardan en
 * public/data/fichas-vlc.json (≈40 kB comprimido) y se descargan la primera vez que
 * se toca un servicio. Cada punto del mapa se empareja con su ficha por cercanía y nombre.
 */
import type { LngLat } from '../core/types';

export interface Ficha {
  n: string;
  c: string;
  t: string;
  ll: LngLat;
  a?: string;
  cp?: string;
  ad?: string;
  org?: string;
  tel?: string;
  em?: string;
  web?: string;
  h?: string;
  cita?: string;
  citaU?: string;
  dept?: string;
  svc?: string[];
  tr?: string[];
  ch?: string[];
  acc?: { items: [string, string][]; src?: string };
  src: string[];
}

export interface Tramite {
  es: string;
  admin?: string;
  online?: string;
  info?: string;
  es_n?: string;
}

export interface FichasDoc {
  meta: { generated: string };
  sources: Record<string, { name: string; org: string; page: string }>;
  procs: Record<string, Tramite>;
  points: Ficha[];
}

let cache: Promise<FichasDoc> | undefined;

export function loadFichas(): Promise<FichasDoc> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/fichas-vlc.json`).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<FichasDoc>;
  });
  cache.catch(() => { cache = undefined; }); // permite reintentar
  return cache;
}

const STOP = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'i', 'y', 'en', 'a', 'd', 'l', 'centro', 'centre', 'municipal', 'publico', 'public', 'valencia']);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** distancia aproximada en metros (suficiente a escala de ciudad) */
const meters = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 85_900, (a[1] - b[1]) * 111_100);

function similarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  x.forEach((w) => { if (y.has(w)) common++; });
  return common / Math.min(x.size, y.size);
}

/**
 * Ficha del servicio: la más parecida de nombre a menos de 120 m, o la que esté
 * prácticamente en el mismo punto (< 20 m) si el nombre no ayuda.
 */
export function matchFicha(doc: FichasDoc, name: string, at: LngLat): Ficha | undefined {
  let best: Ficha | undefined;
  let bestScore = 0;
  for (const f of doc.points) {
    const d = meters(at, f.ll);
    if (d > 120) continue;
    const sim = similarity(name, f.n);
    const score = sim >= 0.5 ? 1 + sim - d / 1000 : d < 20 ? 0.5 - d / 100 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const safeUrl = (u?: string) => (u && /^https?:\/\//.test(u) ? esc(u) : '');
const domain = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(«"'-])(\p{L})/gu, (m) => m.toUpperCase()) : s);

const ACC_OK = /^(cumple|si|sí|accesible)/i;

/** Ficha breve: lo esencial a la vista y lo demás plegado. */
export function fichaHtml(f: Ficha, doc: FichasDoc): string {
  const rows: string[] = [];
  if (f.a) rows.push(`<li><span aria-hidden="true">📍</span><span>${esc(f.a)}${f.cp ? ` · ${esc(f.cp)}` : ''}</span></li>`);
  const contact: string[] = [];
  if (f.tel) contact.push(`<a href="tel:${esc(f.tel.replace(/\s/g, ''))}">${esc(f.tel)}</a>`);
  if (f.em) contact.push(`<a href="mailto:${esc(f.em)}">${esc(f.em)}</a>`);
  if (contact.length) rows.push(`<li><span aria-hidden="true">☎</span><span>${contact.join(' · ')}</span></li>`);
  const web = safeUrl(f.web);
  if (web) rows.push(`<li><span aria-hidden="true">🌐</span><a href="${web}" target="_blank" rel="noopener">${esc(domain(f.web!))}</a></li>`);
  if (f.h) {
    const short = f.h.length > 110 ? `${esc(f.h.slice(0, 110).replace(/\s+\S*$/, ''))}… <details class="f-more"><summary>ver todo</summary>${esc(f.h)}</details>` : esc(f.h);
    rows.push(`<li><span aria-hidden="true">🕐</span><span>${short}</span></li>`);
  }
  const cita = safeUrl(f.citaU);
  if (f.cita || cita) rows.push(`<li><span aria-hidden="true">📅</span><span>${esc(f.cita ?? 'Cita previa')}${cita ? ` · <a href="${cita}" target="_blank" rel="noopener">Pedir cita ↗</a>` : ''}</span></li>`);

  const procs = (f.tr ?? []).map((id) => doc.procs[id]).filter(Boolean);
  const tramites = procs.length
    ? `<details class="f-sec"><summary>Trámites (${procs.length})</summary><ul>${procs.map((p) => {
      const online = safeUrl(p.online);
      const info = safeUrl(p.info);
      return `<li><b>${esc(p.es)}</b>${p.es_n ? `<span class="f-hint">${esc(p.es_n)}</span>` : ''}<span class="f-links">${online ? `<a href="${online}" target="_blank" rel="noopener">Online ↗</a>` : ''}${info ? `<a href="${info}" target="_blank" rel="noopener">Información ↗</a>` : ''}</span></li>`;
    }).join('')}</ul></details>`
    : '';

  const acc = f.acc?.items.length
    ? `<details class="f-sec"><summary>♿ Accesibilidad · ${f.acc.items.filter(([, v]) => ACC_OK.test(v)).length}/${f.acc.items.length} puntos adaptados</summary><ul>${f.acc.items
      .map(([k, v]) => `<li>${ACC_OK.test(v) ? '✓' : '⚠'} ${esc(k)}: <span class="f-hint">${esc(v.toLowerCase())}</span></li>`)
      .join('')}</ul><span class="f-hint">Según el estudio oficial; no sustituye a una comprobación in situ.</span></details>`
    : '';

  const src = f.src.map((k) => doc.sources[k]).filter(Boolean)[0];
  const who = [f.ad, f.org && f.org !== f.ad ? f.org : ''].filter(Boolean).map(esc).join(' · ');
  const svc = f.svc?.length ? `<div class="f-hint">${f.svc.map(esc).join(' · ')}</div>` : '';
  return `<div class="ficha">
    <div class="f-eye">${esc(f.t)}</div>
    <strong>${esc(titleCase(f.n))}</strong>
    ${who ? `<div class="f-org">${who}</div>` : ''}${svc}${f.dept ? `<div class="f-hint">${esc(f.dept)}</div>` : ''}
    <ul class="f-rows">${rows.join('')}</ul>
    ${tramites}${acc}
    ${src ? `<div class="src">Fuente: <a href="${safeUrl(src.page)}" target="_blank" rel="noopener">${esc(src.org)}</a></div>` : ''}
  </div>`;
}
