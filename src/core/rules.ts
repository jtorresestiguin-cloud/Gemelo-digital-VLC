/**
 * Motor de reglas: cruza fuentes heterogéneas por distrito y genera alertas
 * que ninguna fuente daría por separado.
 */
import type { Alert, CityState, LngLat, Severity, SourceId } from './types';
import { ZONES, ZONE_BY_ID } from '../data/static';
import { nearestMetroStation } from './geo';

export const THRESHOLDS = {
  /** mm/h a partir de los que consideramos que llueve de forma relevante */
  rain: 2,
  /** mm/h: lluvia fuerte (AEMET: fuerte 15–30 mm/h) */
  heavyRain: 15,
  /** mm/h: lluvia muy fuerte / torrencial */
  torrentialRain: 30,
  /** µg/m³ NO2: valor límite horario UE = 200 */
  no2Warning: 150,
  no2Critical: 200,
  /** µg/m³ PM10: valor límite diario UE = 50 */
  pm10Warning: 50,
  /** fracción de tramos densos/congestionados en un distrito */
  congestion: 0.5,
  /** camiones en cola en accesos al puerto */
  portQueue: 40,
  /** minutos de retraso de una línea de metro */
  metroDelay: 8,
};

export interface ZoneSummary {
  zoneId: string;
  segments: number;
  congested: number;
  closed: number;
  congestionRatio: number;
  incidents: number;
  maxIncidentSeverity: number;
  incidentAt?: LngLat;
  maxNo2?: number;
  maxPm10?: number;
  emptyBikeStations: number;
  maxNoise?: number;
}

const maxDefined = (a: number | undefined, b: number | undefined) =>
  b === undefined ? a : a === undefined ? b : Math.max(a, b);

export function summarizeZones(state: CityState): Map<string, ZoneSummary> {
  const out = new Map<string, ZoneSummary>();
  for (const z of ZONES) {
    out.set(z.id, {
      zoneId: z.id, segments: 0, congested: 0, closed: 0, congestionRatio: 0,
      incidents: 0, maxIncidentSeverity: 0, emptyBikeStations: 0,
    });
  }
  const get = (id: string) => out.get(id);

  for (const s of state.traffic) {
    const z = get(s.zoneId);
    if (!z || s.state === 'unknown') continue;
    z.segments++;
    if (s.state === 'congested' || s.state === 'dense') z.congested++;
    if (s.state === 'closed') z.closed++;
  }
  for (const i of state.incidents) {
    const z = get(i.zoneId);
    if (!z) continue;
    z.incidents++;
    if (i.severity >= z.maxIncidentSeverity) {
      z.maxIncidentSeverity = i.severity;
      z.incidentAt = i.lngLat;
    }
  }
  for (const a of state.air) {
    const z = get(a.zoneId);
    if (!z) continue;
    z.maxNo2 = maxDefined(z.maxNo2, a.no2);
    z.maxPm10 = maxDefined(z.maxPm10, a.pm10);
  }
  for (const b of state.bikes) {
    const z = get(b.zoneId);
    if (z && b.total > 0 && b.available === 0) z.emptyBikeStations++;
  }
  for (const n of state.noise) {
    const z = get(n.zoneId);
    if (z) z.maxNoise = maxDefined(z.maxNoise, n.laeq);
  }
  for (const z of out.values()) {
    z.congestionRatio = z.segments ? (z.congested + z.closed) / z.segments : 0;
  }
  return out;
}

interface RuleContext {
  state: CityState;
  zones: Map<string, ZoneSummary>;
  rain: number;
  interruptedLines: Set<string>;
}

type RuleOutput = Omit<Alert, 'id' | 'since'>;

export interface Rule {
  id: string;
  name: string;
  description: string;
  evaluate(ctx: RuleContext): RuleOutput[];
}

const zoneName = (id: string) => ZONE_BY_ID[id]?.name ?? 'València';
const isJammed = (z: ZoneSummary) => z.congestionRatio >= THRESHOLDS.congestion || z.congested + z.closed >= 2;

export const RULES: Rule[] = [
  {
    id: 'R1',
    name: 'Incidente + atasco (+ lluvia)',
    description: 'Un incidente en un distrito con tráfico denso o congestionado. Si además llueve, la alerta pasa a crítica y se recomienda cambiar coche por metro.',
    evaluate({ zones, rain, interruptedLines }) {
      const out: RuleOutput[] = [];
      for (const z of zones.values()) {
        if (!z.incidents || !isJammed(z)) continue;
        const raining = rain >= THRESHOLDS.rain;
        const at = z.incidentAt ?? ZONE_BY_ID[z.zoneId].center;
        const station = nearestMetroStation(at, interruptedLines);
        const sources: SourceId[] = ['iot', 'traffic', 'metro'];
        if (raining) sources.push('weather');
        out.push({
          ruleId: 'R1',
          severity: raining ? 'critical' : 'warning',
          zoneId: z.zoneId,
          title: raining ? `Choque + atasco + lluvia en ${zoneName(z.zoneId)}` : `Incidente con atasco en ${zoneName(z.zoneId)}`,
          description: `${z.incidents} incidente(s) y ${Math.round(z.congestionRatio * 100)}% de tramos densos o congestionados${raining ? ` con ${rain.toFixed(1)} mm/h de lluvia` : ''}.`,
          sources,
          lngLat: at,
          recommendation: station
            ? {
                text: `Evitar el coche en la zona: ruta recomendada en metro desde ${station.name} (${station.lines.filter((l) => !interruptedLines.has(l)).join(', ')}).`,
                target: station.lngLat,
                targetName: station.name,
              }
            : undefined,
        });
      }
      return out;
    },
  },
  {
    id: 'R2',
    name: 'Contaminación + congestión',
    description: 'NO2 o PM10 por encima de umbral en un distrito que además está congestionado: el tráfico es la causa probable.',
    evaluate({ zones }) {
      const out: RuleOutput[] = [];
      for (const z of zones.values()) {
        const no2 = z.maxNo2 ?? 0;
        const pm10 = z.maxPm10 ?? 0;
        const polluted = no2 >= THRESHOLDS.no2Warning || pm10 >= THRESHOLDS.pm10Warning;
        if (!polluted || !isJammed(z)) continue;
        const severity: Severity = no2 >= THRESHOLDS.no2Critical ? 'critical' : 'warning';
        out.push({
          ruleId: 'R2',
          severity,
          zoneId: z.zoneId,
          title: `Episodio de contaminación por tráfico en ${zoneName(z.zoneId)}`,
          description: `NO2 ${Math.round(no2)} µg/m³, PM10 ${Math.round(pm10)} µg/m³ con ${Math.round(z.congestionRatio * 100)}% de la red congestionada.`,
          sources: ['air', 'traffic'],
          lngLat: ZONE_BY_ID[z.zoneId].center,
          recommendation: { text: 'Activar protocolo de restricción de tráfico, reforzar EMT/metro y promocionar Valenbisi en la zona.' },
        });
      }
      return out;
    },
  },
  {
    id: 'R3',
    name: 'Riesgo por lluvia intensa (DANA)',
    description: 'Lluvia fuerte en distritos bajos o próximos al mar. Si alguna línea de metro está interrumpida, se escala a crítica.',
    evaluate({ rain, interruptedLines }) {
      if (rain < THRESHOLDS.heavyRain) return [];
      const torrential = rain >= THRESHOLDS.torrentialRain || interruptedLines.size > 0;
      return ZONES.filter((z) => z.floodProne).map((z) => ({
        ruleId: 'R3',
        severity: torrential ? 'critical' : 'warning',
        zoneId: z.id,
        title: `Riesgo de inundación en ${z.name}`,
        description: `Precipitación de ${rain.toFixed(1)} mm/h${interruptedLines.size ? ` y líneas de metro interrumpidas (${[...interruptedLines].join(', ')})` : ''}.`,
        sources: interruptedLines.size ? ['weather', 'metro'] : ['weather'],
        lngLat: z.center,
        recommendation: { text: 'Evitar pasos inferiores y bajos, revisar imbornales y avisar a la población de la zona.' },
      }));
    },
  },
  {
    id: 'R4',
    name: 'Saturación del puerto',
    description: 'Cola de camiones en los accesos al puerto con congestión en los distritos marítimos.',
    evaluate({ state, zones }) {
      const port = state.port;
      if (!port || port.gateQueue < THRESHOLDS.portQueue) return [];
      const affected = ['poblats-maritims', 'camins'].filter((id) => {
        const z = zones.get(id);
        return z && z.congested + z.closed > 0;
      });
      if (!affected.length) return [];
      return affected.map((id) => ({
        ruleId: 'R4',
        severity: 'warning' as const,
        zoneId: id,
        title: `Cola de camiones del puerto afectando a ${zoneName(id)}`,
        description: `${port.gateQueue} camiones en accesos, ${port.cranesActive}/${port.cranesTotal} grúas activas, atraques al ${Math.round(port.berthOccupancy)}%.`,
        sources: ['port', 'traffic'],
        lngLat: ZONE_BY_ID[id].center,
        recommendation: { text: 'Escalonar las citas de entrada de camiones y desviar el tráfico pesado por la V-30.' },
      }));
    },
  },
  {
    id: 'R5',
    name: 'Valenbisi vacío en zona congestionada',
    description: 'Estaciones sin bicis justo donde la bici sería la alternativa al coche.',
    evaluate({ zones }) {
      const out: RuleOutput[] = [];
      for (const z of zones.values()) {
        if (z.emptyBikeStations < 2 || !isJammed(z)) continue;
        out.push({
          ruleId: 'R5',
          severity: 'info',
          zoneId: z.zoneId,
          title: `Reequilibrar Valenbisi en ${zoneName(z.zoneId)}`,
          description: `${z.emptyBikeStations} estaciones vacías en un distrito con tráfico denso.`,
          sources: ['bikes', 'traffic'],
          lngLat: ZONE_BY_ID[z.zoneId].center,
          recommendation: { text: 'Priorizar el camión de reequilibrado hacia este distrito.' },
        });
      }
      return out;
    },
  },
  {
    id: 'R6',
    name: 'Movilidad degradada',
    description: 'Retrasos importantes en metro a la vez que congestión generalizada: no hay alternativa buena.',
    evaluate({ state, zones }) {
      const delayed = state.metro.filter((l) => l.status !== 'ok' && l.delayMin >= THRESHOLDS.metroDelay);
      if (!delayed.length) return [];
      const all = [...zones.values()].filter((z) => z.segments > 0);
      const jammed = all.filter(isJammed).length;
      if (!all.length || jammed / all.length < 0.35) return [];
      return [{
        ruleId: 'R6',
        severity: 'warning',
        zoneId: 'ciudad',
        title: 'Movilidad degradada en toda la ciudad',
        description: `${delayed.map((l) => `${l.id} +${l.delayMin} min`).join(', ')} y ${jammed} de ${all.length} distritos congestionados.`,
        sources: ['metro', 'traffic'],
        recommendation: { text: 'Reforzar frecuencias de EMT y comunicar alternativas por paneles y redes.' },
      }];
    },
  },
];

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Evalúa todas las reglas. `previous` permite conservar la fecha de inicio de alertas que siguen activas.
 */
export function evaluateRules(state: CityState, now: number, previous: Alert[] = []): Alert[] {
  const zones = summarizeZones(state);
  const ctx: RuleContext = {
    state,
    zones,
    rain: state.weather?.precipitation ?? 0,
    interruptedLines: new Set(state.metro.filter((l) => l.status === 'interrupted').map((l) => l.id)),
  };
  const prevSince = new Map(previous.map((a) => [a.id, a.since]));
  const alerts: Alert[] = [];
  for (const rule of RULES) {
    for (const r of rule.evaluate(ctx)) {
      const id = `${r.ruleId}:${r.zoneId}`;
      alerts.push({ ...r, id, since: prevSince.get(id) ?? now });
    }
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.since - b.since);
}
