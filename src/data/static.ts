/**
 * Datos estáticos de València.
 * Coordenadas aproximadas (suficientes para agregación por distrito y visualización).
 */
import type { LngLat, MetroLine } from '../core/types';

export const VALENCIA_CENTER: LngLat = [-0.3763, 39.4699];
export const VALENCIA_BOUNDS: [LngLat, LngLat] = [
  [-0.46, 39.30],
  [-0.28, 39.57],
];

export interface Zone {
  id: string;
  /** código oficial de distrito del Ajuntament (1–19) */
  code: number;
  name: string;
  center: LngLat;
  /** zonas bajas / cercanas al mar o a barrancos, más expuestas a lluvias torrenciales */
  floodProne?: boolean;
}

/** Los 19 distritos de València (centroides aproximados). */
export const ZONES: Zone[] = [
  { id: 'ciutat-vella', code: 1, name: 'Ciutat Vella', center: [-0.3766, 39.4747] },
  { id: 'eixample', code: 2, name: "L'Eixample", center: [-0.3700, 39.4640] },
  { id: 'extramurs', code: 3, name: 'Extramurs', center: [-0.3880, 39.4690] },
  { id: 'campanar', code: 4, name: 'Campanar', center: [-0.3970, 39.4840] },
  { id: 'saidia', code: 5, name: 'La Saïdia', center: [-0.3790, 39.4880] },
  { id: 'pla-del-real', code: 6, name: 'El Pla del Real', center: [-0.3600, 39.4790] },
  { id: 'olivereta', code: 7, name: "L'Olivereta", center: [-0.4040, 39.4700] },
  { id: 'patraix', code: 8, name: 'Patraix', center: [-0.3970, 39.4590] },
  { id: 'jesus', code: 9, name: 'Jesús', center: [-0.3850, 39.4530] },
  { id: 'quatre-carreres', code: 10, name: 'Quatre Carreres', center: [-0.3650, 39.4500], floodProne: true },
  { id: 'poblats-maritims', code: 11, name: 'Poblats Marítims', center: [-0.3300, 39.4650], floodProne: true },
  { id: 'camins', code: 12, name: 'Camins al Grau', center: [-0.3500, 39.4650], floodProne: true },
  { id: 'algiros', code: 13, name: 'Algirós', center: [-0.3470, 39.4770] },
  { id: 'benimaclet', code: 14, name: 'Benimaclet', center: [-0.3600, 39.4870] },
  { id: 'rascanya', code: 15, name: 'Rascanya', center: [-0.3720, 39.4960] },
  { id: 'benicalap', code: 16, name: 'Benicalap', center: [-0.3950, 39.4960] },
  { id: 'pobles-nord', code: 17, name: 'Pobles del Nord', center: [-0.3720, 39.5220] },
  { id: 'pobles-oest', code: 18, name: "Pobles de l'Oest", center: [-0.4280, 39.4950] },
  { id: 'pobles-sud', code: 19, name: 'Pobles del Sud', center: [-0.3420, 39.3900], floodProne: true },
];

export const ZONE_BY_ID: Record<string, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export const METRO_LINES: Omit<MetroLine, 'delayMin' | 'status'>[] = [
  { id: 'L1', name: 'Línia 1', color: '#e3b505' },
  { id: 'L2', name: 'Línia 2', color: '#d6006f' },
  { id: 'L3', name: 'Línia 3', color: '#c1272d' },
  { id: 'L4', name: 'Línia 4 (tramvia)', color: '#1b5e9e' },
  { id: 'L5', name: 'Línia 5', color: '#009b3a' },
  { id: 'L6', name: 'Línia 6 (tramvia)', color: '#8e5ea2' },
  { id: 'L7', name: 'Línia 7', color: '#e87722' },
  { id: 'L8', name: 'Línia 8 (tramvia)', color: '#00a3ad' },
  { id: 'L9', name: 'Línia 9', color: '#a77b47' },
  { id: 'L10', name: 'Línia 10', color: '#7cb342' },
];

export interface MetroStation {
  id: string;
  name: string;
  lngLat: LngLat;
  lines: string[];
}

export const METRO_STATIONS: MetroStation[] = [
  { id: 'xativa', name: 'Xàtiva', lngLat: [-0.3772, 39.4672], lines: ['L3', 'L5', 'L9'] },
  { id: 'colon', name: 'Colón', lngLat: [-0.3708, 39.4699], lines: ['L3', 'L5', 'L7', 'L9'] },
  { id: 'angel-guimera', name: 'Àngel Guimerà', lngLat: [-0.3878, 39.4693], lines: ['L1', 'L2', 'L3', 'L5', 'L9'] },
  { id: 'placa-espanya', name: "Plaça d'Espanya", lngLat: [-0.3845, 39.4665], lines: ['L1', 'L2', 'L7'] },
  { id: 'jesus', name: 'Jesús', lngLat: [-0.3828, 39.4574], lines: ['L1', 'L2', 'L7'] },
  { id: 'alameda', name: 'Alameda', lngLat: [-0.3650, 39.4716], lines: ['L3', 'L5', 'L7', 'L9'] },
  { id: 'arago', name: 'Aragó', lngLat: [-0.3560, 39.4745], lines: ['L5', 'L7'] },
  { id: 'amistat', name: 'Amistat', lngLat: [-0.3523, 39.4686], lines: ['L5', 'L7'] },
  { id: 'ayora', name: 'Ayora', lngLat: [-0.3446, 39.4648], lines: ['L5', 'L7'] },
  { id: 'maritim', name: 'Marítim', lngLat: [-0.3370, 39.4610], lines: ['L5', 'L6', 'L8'] },
  { id: 'facultats', name: 'Facultats', lngLat: [-0.3613, 39.4778], lines: ['L3', 'L9'] },
  { id: 'benimaclet', name: 'Benimaclet', lngLat: [-0.3592, 39.4853], lines: ['L3', 'L4', 'L6', 'L9'] },
  { id: 'campanar', name: 'Campanar', lngLat: [-0.3958, 39.4830], lines: ['L1', 'L2'] },
  { id: 'turia', name: 'Túria', lngLat: [-0.3897, 39.4758], lines: ['L1', 'L2'] },
  { id: 'empalme', name: 'Empalme', lngLat: [-0.3976, 39.4985], lines: ['L1', 'L2', 'L4'] },
  { id: 'russafa', name: 'Russafa', lngLat: [-0.3746, 39.4618], lines: ['L10'] },
  { id: 'alacant', name: 'Alacant', lngLat: [-0.3800, 39.4630], lines: ['L10'] },
  { id: 'arts-ciencies', name: 'Ciutat Arts i Ciències', lngLat: [-0.3539, 39.4553], lines: ['L10'] },
];

export interface PortAsset {
  id: string;
  name: string;
  kind: 'terminal' | 'gate' | 'berth';
  lngLat: LngLat;
}

/** Elementos del puerto (genéricos; los datos de los PLCs son simulados). */
export const PORT_ASSETS: PortAsset[] = [
  { id: 'term-norte', name: 'Terminal de contenedores Norte', kind: 'terminal', lngLat: [-0.3200, 39.4520] },
  { id: 'term-sur', name: 'Terminal de contenedores Sur', kind: 'terminal', lngLat: [-0.3165, 39.4380] },
  { id: 'atraque-este', name: 'Muelle de atraque Este', kind: 'berth', lngLat: [-0.3080, 39.4440] },
  { id: 'acceso-norte', name: 'Acceso Norte (camiones)', kind: 'gate', lngLat: [-0.3290, 39.4565] },
  { id: 'acceso-sur', name: 'Acceso Sur (V-30)', kind: 'gate', lngLat: [-0.3330, 39.4450] },
];

export const LANDMARKS: { name: string; lngLat: LngLat }[] = [
  { name: 'Ciutat de les Arts i les Ciències', lngLat: [-0.3505, 39.4545] },
  { name: 'Catedral i Micalet', lngLat: [-0.3753, 39.4755] },
  { name: 'Mercat Central', lngLat: [-0.3790, 39.4737] },
  { name: 'Torres de Serrans', lngLat: [-0.3758, 39.4792] },
  { name: 'Estació del Nord', lngLat: [-0.3773, 39.4664] },
  { name: 'Estadi de Mestalla', lngLat: [-0.3583, 39.4746] },
  { name: 'La Marina de València', lngLat: [-0.3270, 39.4600] },
  { name: 'Jardí del Túria', lngLat: [-0.3680, 39.4770] },
];

/** Tramos de las principales vías: se usan si el servicio municipal de tráfico no responde. */
export const FALLBACK_SEGMENTS: { id: string; name: string; coords: LngLat[] }[] = [
  { id: 'blasco-ibanez', name: 'Av. de Blasco Ibáñez', coords: [[-0.3640, 39.4760], [-0.3450, 39.4740], [-0.3330, 39.4720]] },
  { id: 'gv-marques-turia', name: 'Gran Via del Marqués del Túria', coords: [[-0.3770, 39.4640], [-0.3660, 39.4680]] },
  { id: 'gv-ferran-catolic', name: 'Gran Via de Ferran el Catòlic', coords: [[-0.3900, 39.4710], [-0.3880, 39.4640]] },
  { id: 'av-port', name: 'Av. del Port', coords: [[-0.3600, 39.4640], [-0.3450, 39.4620], [-0.3300, 39.4580]] },
  { id: 'tarongers', name: 'Av. dels Tarongers', coords: [[-0.3500, 39.4790], [-0.3300, 39.4800]] },
  { id: 'corts-valencianes', name: 'Av. de les Corts Valencianes', coords: [[-0.3990, 39.4930], [-0.4080, 39.5000]] },
  { id: 'pius-xii', name: 'Av. de Pius XII', coords: [[-0.3990, 39.4700], [-0.3950, 39.4810]] },
  { id: 'av-cid', name: 'Av. del Cid', coords: [[-0.3930, 39.4680], [-0.4100, 39.4660]] },
  { id: 'ausias-march', name: "Av. d'Ausiàs March", coords: [[-0.3750, 39.4560], [-0.3700, 39.4400]] },
  { id: 'peris-valero', name: 'Av. de Peris i Valero', coords: [[-0.3780, 39.4580], [-0.3620, 39.4600]] },
  { id: 'arago', name: "Av. d'Aragó", coords: [[-0.3580, 39.4700], [-0.3560, 39.4790]] },
  { id: 'franca', name: 'Av. de França', coords: [[-0.3560, 39.4590], [-0.3400, 39.4580]] },
  { id: 'v30-port', name: 'V-30 (accés port)', coords: [[-0.3400, 39.4480], [-0.3200, 39.4500]] },
  { id: 'colon', name: 'Carrer de Colón', coords: [[-0.3770, 39.4690], [-0.3700, 39.4700]] },
  { id: 'primat-reig', name: 'Av. del Primat Reig', coords: [[-0.3700, 39.4880], [-0.3600, 39.4830]] },
  { id: 'serreria', name: 'Av. de la Serrería', coords: [[-0.3380, 39.4720], [-0.3360, 39.4600]] },
];

/** Estaciones de la red de vigilancia de calidad del aire (respaldo si la API no responde). */
export const AIR_STATIONS_FALLBACK: { id: string; name: string; lngLat: LngLat }[] = [
  { id: 'pista-silla', name: 'Pista de Silla', lngLat: [-0.3770, 39.4580] },
  { id: 'avda-franca', name: 'Av. França', lngLat: [-0.3427, 39.4576] },
  { id: 'bulevard-sud', name: 'Bulevard Sud', lngLat: [-0.3963, 39.4504] },
  { id: 'moli-sol', name: 'Molí del Sol', lngLat: [-0.4087, 39.4809] },
  { id: 'politecnic', name: 'Politècnic', lngLat: [-0.3373, 39.4796] },
  { id: 'vivers', name: 'Vivers', lngLat: [-0.3696, 39.4796] },
  { id: 'centre', name: 'Centre', lngLat: [-0.3764, 39.4706] },
  { id: 'port', name: 'Port de València', lngLat: [-0.3220, 39.4480] },
];

/** Sensores de ruido IoT (simulados, publican por MQTT). */
export const NOISE_SENSORS: { id: string; lngLat: LngLat }[] = [
  { id: 'N01', lngLat: [-0.3760, 39.4740] },
  { id: 'N02', lngLat: [-0.3720, 39.4630] },
  { id: 'N03', lngLat: [-0.3880, 39.4700] },
  { id: 'N04', lngLat: [-0.3600, 39.4790] },
  { id: 'N05', lngLat: [-0.3450, 39.4620] },
  { id: 'N06', lngLat: [-0.3300, 39.4660] },
  { id: 'N07', lngLat: [-0.3970, 39.4840] },
  { id: 'N08', lngLat: [-0.3850, 39.4540] },
  { id: 'N09', lngLat: [-0.3650, 39.4510] },
  { id: 'N10', lngLat: [-0.3600, 39.4870] },
  { id: 'N11', lngLat: [-0.3730, 39.4950] },
  { id: 'N12', lngLat: [-0.4030, 39.4700] },
];
