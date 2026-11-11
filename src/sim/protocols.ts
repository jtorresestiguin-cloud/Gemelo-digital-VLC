/**
 * Formatos "en el cable" de cada protocolo. Los simuladores emiten exactamente estos
 * formatos, así que sustituirlos por drivers reales solo exige cambiar el transporte.
 */

/** MQTT: topic + payload JSON (p. ej. desde un broker Mosquitto vía WebSocket). */
export interface MqttMessage {
  protocol: 'MQTT';
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
}

/** GTFS-Realtime (versión JSON del FeedMessage protobuf). */
export interface GtfsRtFeed {
  protocol: 'GTFS-RT';
  feed: {
    header: { gtfs_realtime_version: '2.0'; incrementality: 'FULL_DATASET'; timestamp: number };
    entity: Array<{
      id: string;
      trip_update?: { trip: { route_id: string }; delay: number };
      alert?: {
        informed_entity: Array<{ route_id: string }>;
        effect: 'NO_SERVICE' | 'REDUCED_SERVICE' | 'SIGNIFICANT_DELAYS';
        header_text: { translation: Array<{ text: string; language: string }> };
      };
    }>;
  };
}

/** OPC UA: lecturas de nodos (DataValue) de los PLCs de la terminal. */
export interface OpcUaRead {
  protocol: 'OPC-UA';
  endpoint: string;
  nodes: Array<{
    nodeId: string;
    value: { dataType: 'Int32' | 'Double' | 'Boolean'; value: number | boolean };
    statusCode: 'Good' | 'Uncertain' | 'Bad';
    sourceTimestamp: string;
  }>;
}

/** NGSI-LD (FIWARE): entidades según los Smart Data Models. */
export interface NgsiLdNotification {
  protocol: 'NGSI-LD';
  type: 'Notification';
  subscriptionId: string;
  notifiedAt: string;
  data: NgsiEntity[];
}

export interface NgsiEntity {
  id: string;
  type: string;
  location?: { type: 'GeoProperty'; value: { type: string; coordinates: unknown } };
  [attr: string]: unknown;
}

export type RawMessage = MqttMessage | GtfsRtFeed | OpcUaRead | NgsiLdNotification;

export type SimSource = 'traffic' | 'air' | 'bikes';

export type WorkerCommand =
  | { type: 'enable'; source: SimSource }
  | { type: 'disable'; source: SimSource }
  | { type: 'scenario'; name: ScenarioName };

export type ScenarioName = 'accidente-lluvia' | 'episodio-no2' | 'colapso-puerto' | 'averia-metro' | 'reset';
