/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clave de Google Maps Platform (Map Tiles API) inyectada al compilar; opcional. */
  readonly VITE_GOOGLE_MAPS_KEY?: string;
  /** Token de Cesium ion inyectado al compilar; opcional. */
  readonly VITE_CESIUM_ION_TOKEN?: string;
}
