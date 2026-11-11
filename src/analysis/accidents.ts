/**
 * Accidentes frente a la lluvia: ¿cuánto aumenta la tasa de accidentes por hora cuando llueve?
 *
 * - Exposición: horas con lluvia (precipitación ≥ umbral) frente a horas secas.
 * - Razón de tasas bruta y ajustada por Mantel-Haenszel, estratificando por hora del día
 *   × laborable/fin de semana (la lluvia no se reparte igual a lo largo del día y el tráfico tampoco).
 * - IC 95 % con la varianza de Greenland–Robins para datos de persona-tiempo.
 *
 * Todas las horas son locales (Europe/Madrid) y se identifican como "YYYY-MM-DDTHH".
 */

export type HourKey = string;

export interface ParsedAccidents {
  keys: HourKey[];
  skipped: number;
  dateColumn: string;
  hourColumn?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === sep && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Admite 2024-03-15, 15/03/2024, 15-03-2024 y variantes con hora ("… 08:30", "…T08:30:00"). */
export function parseDateHour(dateStr: string, hourStr?: string): HourKey | undefined {
  const d = dateStr.trim();
  let y: number, m: number, day: number;
  let rest = '';
  let match = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (match) {
    [y, m, day] = [+match[1], +match[2], +match[3]];
    rest = match[4];
  } else if ((match = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/))) {
    [day, m, y] = [+match[1], +match[2], +match[3]];
    rest = match[4];
  } else return undefined;
  if (m < 1 || m > 12 || day < 1 || day > 31) return undefined;
  const hm = (hourStr ?? rest).match(/(\d{1,2})(?::\d{2})?/);
  const h = hm ? +hm[1] : NaN;
  if (!Number.isFinite(h) || h > 23) return undefined;
  return `${y}-${pad(m)}-${pad(day)}T${pad(h)}`;
}

export function parseAccidentCsv(text: string): ParsedAccidents {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('El CSV no tiene filas de datos');
  const sep = [';', ',', '\t'].map((s) => [s, lines[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const header = splitCsvLine(lines[0], sep).map(norm);
  const dateIdx = header.findIndex((h) => /fecha|date|data|dia/.test(h));
  if (dateIdx < 0) throw new Error('No encuentro una columna de fecha (fecha, date, data…)');
  const hourIdx = header.findIndex((h, i) => i !== dateIdx && /^(hora|hour|hora_.*|.*_hora|franja.*)$/.test(h));
  const keys: HourKey[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], sep);
    const k = parseDateHour(cols[dateIdx] ?? '', hourIdx >= 0 ? cols[hourIdx] : undefined);
    if (k) keys.push(k);
    else skipped++;
  }
  return { keys, skipped, dateColumn: header[dateIdx], hourColumn: hourIdx >= 0 ? header[hourIdx] : undefined };
}

export interface RainStudy {
  accidents: number;
  wetHours: number;
  dryHours: number;
  wetAccidents: number;
  dryAccidents: number;
  wetRate: number;
  dryRate: number;
  crudeRR: number;
  adjustedRR: number;
  ci95: [number, number];
  /** tasa (accidentes/hora) por hora del día, en seco y con lluvia */
  byHour: { hour: number; dry: number; wet: number; wetHours: number }[];
  /** accidentes fuera del periodo con datos meteorológicos */
  unmatched: number;
}

const isWeekend = (key: HourKey) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
};

export function analyzeRain(accidents: HourKey[], rain: Map<HourKey, number>, threshold = 0.1): RainStudy {
  // estratos: hora del día (0–23) × laborable/fin de semana
  const S = 48;
  const a = new Array(S).fill(0); // accidentes con lluvia
  const b = new Array(S).fill(0); // accidentes en seco
  const t1 = new Array(S).fill(0); // horas con lluvia
  const t0 = new Array(S).fill(0); // horas secas
  const stratum = (k: HourKey) => +k.slice(11, 13) * 2 + (isWeekend(k) ? 1 : 0);

  for (const [k, mm] of rain) {
    if (mm >= threshold) t1[stratum(k)]++;
    else t0[stratum(k)]++;
  }
  let unmatched = 0;
  for (const k of accidents) {
    const mm = rain.get(k);
    if (mm === undefined) { unmatched++; continue; }
    if (mm >= threshold) a[stratum(k)]++;
    else b[stratum(k)]++;
  }

  const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const A = sum(a), B = sum(b), T1 = sum(t1), T0 = sum(t0);
  let num = 0, den = 0, varNum = 0;
  for (let i = 0; i < S; i++) {
    const T = t1[i] + t0[i];
    if (!T || !t1[i] || !t0[i]) continue;
    num += (a[i] * t0[i]) / T;
    den += (b[i] * t1[i]) / T;
    varNum += ((a[i] + b[i]) * t1[i] * t0[i]) / (T * T);
  }
  const adjustedRR = den > 0 ? num / den : NaN;
  const se = num > 0 && den > 0 ? Math.sqrt(varNum / (num * den)) : NaN;

  const byHour = Array.from({ length: 24 }, (_, h) => {
    const wa = a[2 * h] + a[2 * h + 1], da = b[2 * h] + b[2 * h + 1];
    const wh = t1[2 * h] + t1[2 * h + 1], dh = t0[2 * h] + t0[2 * h + 1];
    return { hour: h, wet: wh ? wa / wh : 0, dry: dh ? da / dh : 0, wetHours: wh };
  });

  return {
    accidents: A + B,
    wetHours: T1,
    dryHours: T0,
    wetAccidents: A,
    dryAccidents: B,
    wetRate: T1 ? A / T1 : 0,
    dryRate: T0 ? B / T0 : 0,
    crudeRR: T1 && T0 && B ? (A / T1) / (B / T0) : NaN,
    adjustedRR,
    ci95: [adjustedRR * Math.exp(-1.96 * se), adjustedRR * Math.exp(1.96 * se)],
    byHour,
    unmatched,
  };
}

/** Precipitación horaria histórica (Open-Meteo, reanálisis ERA5), en hora local. */
export async function fetchHourlyRain(start: string, end: string, lat = 39.4699, lng = -0.3763): Promise<Map<HourKey, number>> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&hourly=precipitation&timezone=Europe%2FMadrid`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
  const j = (await r.json()) as { hourly: { time: string[]; precipitation: (number | null)[] } };
  const out = new Map<HourKey, number>();
  j.hourly.time.forEach((t, i) => {
    const v = j.hourly.precipitation[i];
    if (v !== null && v !== undefined) out.set(t.slice(0, 13), v);
  });
  return out;
}

/** Rango de fechas (YYYY-MM-DD) que cubre los accidentes. */
export function dateRange(keys: HourKey[]): [string, string] {
  const days = keys.map((k) => k.slice(0, 10)).sort();
  return [days[0], days[days.length - 1]];
}

/**
 * Datos sintéticos para la demo: un año de lluvia y accidentes con un efecto conocido
 * (×`trueRR` cuando llueve). Sirve para enseñar el método sin datos reales.
 */
export function syntheticStudyData(year = 2024, trueRR = 1.5, seed = 7): { accidents: HourKey[]; rain: Map<HourKey, number> } {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const poisson = (lambda: number) => {
    let k = 0, p = 1;
    const L = Math.exp(-lambda);
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
  };
  const rain = new Map<HourKey, number>();
  const accidents: HourKey[] = [];
  let wetSpell = 0;
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    const autumn = d.getUTCMonth() >= 8 && d.getUTCMonth() <= 10;
    for (let h = 0; h < 24; h++) {
      if (wetSpell > 0) wetSpell--;
      else if (rnd() < (autumn ? 0.03 : 0.012)) wetSpell = 2 + Math.floor(rnd() * 8);
      const mm = wetSpell > 0 ? +(0.2 + rnd() * (autumn ? 12 : 4)).toFixed(1) : 0;
      const key = `${day}T${pad(h)}`;
      rain.set(key, mm);
      const traffic = 0.15 + Math.exp(-((h - 8.5) ** 2) / 3) + 1.1 * Math.exp(-((h - 18.5) ** 2) / 4) + 0.5 * Math.exp(-((h - 14) ** 2) / 2);
      const lambda = 1.4 * traffic * (mm > 0 ? trueRR : 1);
      for (let n = poisson(lambda); n > 0; n--) accidents.push(key);
    }
  }
  return { accidents, rain };
}
