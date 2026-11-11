/** [longitud, latitud] en WGS84 */
export type LngLat = [number, number];

export type Protocol = 'REST' | 'MQTT' | 'NGSI-LD' | 'GTFS-RT' | 'OPC-UA';
export type SourceId = 'traffic' | 'bikes' | 'air' | 'weather' | 'iot' | 'metro' | 'port' | 'services';
export type SourceMode = 'connecting' | 'live' | 'simulated' | 'error';

export interface SourceStatus {
  id: SourceId;
  name: string;
  provider: string;
  protocol: Protocol;
  mode: SourceMode;
  messages: number;
  lastUpdate?: number;
  detail?: string;
}

export type TrafficState = 'fluid' | 'dense' | 'congested' | 'closed' | 'unknown';

export interface TrafficSegment {
  id: string;
  name: string;
  state: TrafficState;
  coords: LngLat[];
  zoneId: string;
}

export interface BikeStation {
  id: string;
  name: string;
  lngLat: LngLat;
  available: number;
  free: number;
  total: number;
  zoneId: string;
}

export interface AirStation {
  id: string;
  name: string;
  lngLat: LngLat;
  zoneId: string;
  no2?: number;
  pm10?: number;
  pm25?: number;
  o3?: number;
  quality?: string;
}

export interface Weather {
  temperature: number;
  /** mm/h */
  precipitation: number;
  /** km/h */
  windSpeed: number;
  /** código WMO */
  weatherCode: number;
}

export type IncidentType = 'accident' | 'roadworks' | 'breakdown';

export interface Incident {
  id: string;
  type: IncidentType;
  lngLat: LngLat;
  zoneId: string;
  severity: 1 | 2 | 3;
  ts: number;
}

export interface NoiseSensor {
  id: string;
  lngLat: LngLat;
  zoneId: string;
  /** nivel sonoro equivalente dB(A) */
  laeq: number;
}

export type MetroStatus = 'ok' | 'delayed' | 'interrupted';

export interface MetroLine {
  id: string;
  name: string;
  color: string;
  delayMin: number;
  status: MetroStatus;
}

export interface PortState {
  cranesActive: number;
  cranesTotal: number;
  /** camiones esperando en los accesos */
  gateQueue: number;
  /** % ocupación de atraques */
  berthOccupancy: number;
}

export type ServiceCategory =
  | 'health' | 'education' | 'culture' | 'sport' | 'social' | 'market' | 'administration' | 'emergency';

export interface PublicService {
  id: string;
  name: string;
  category: ServiceCategory;
  /** tipo concreto (Hospital, Farmacia, Biblioteca…) */
  kind: string;
  lngLat: LngLat;
  zoneId: string;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  /** hospital con urgencias */
  emergency?: boolean;
}

export interface CityState {
  traffic: TrafficSegment[];
  bikes: BikeStation[];
  air: AirStation[];
  weather?: Weather;
  incidents: Incident[];
  noise: NoiseSensor[];
  metro: MetroLine[];
  port?: PortState;
  services: PublicService[];
}

export type Severity = 'info' | 'warning' | 'critical';

export interface Recommendation {
  text: string;
  target?: LngLat;
  targetName?: string;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: Severity;
  zoneId: string;
  title: string;
  description: string;
  sources: SourceId[];
  lngLat?: LngLat;
  recommendation?: Recommendation;
  since: number;
}
