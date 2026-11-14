/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clave de Google Maps Platform (Map Tiles API) inyectada al compilar; opcional. */
  readonly VITE_GOOGLE_MAPS_KEY?: string;
}
