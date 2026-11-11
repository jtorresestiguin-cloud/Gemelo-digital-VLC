# Gemelo Digital València

Gemelo digital 3D de la ciudad de València que funciona en el navegador. Integra fuentes
heterogéneas (datos abiertos municipales, meteorología, sensores IoT, metro y puerto) en un
**bus común**, las cruza con un **motor de reglas** por distrito y muestra el resultado sobre
la ciudad en 3D.

## Qué hace

- **7 fuentes en tiempo real, 5 protocolos** en un bus común (`src/core/bus.ts`):

  | Fuente | Protocolo | Origen |
  |---|---|---|
  | Tráfico en tiempo real | REST (Opendatasoft) | **Real**: Ajuntament de València |
  | Valenbisi | REST | **Real**: Ajuntament de València |
  | Calidad del aire | REST | **Real**: red de vigilancia atmosférica |
  | Meteorología | REST | **Real**: Open-Meteo |
  | Sensores IoT (ruido, incidencias) | MQTT | Simulado |
  | Metrovalencia | GTFS-Realtime | Simulado |
  | Port de València (PLCs) | OPC UA | Simulado |
  | Servicios públicos | REST (API Overpass) | **Real**: OpenStreetMap |

  Frecuencia de actualización por API: tráfico cada 3 min, Valenbisi cada 2 min, calidad del
  aire y meteorología cada 10 min, servicios públicos cada 24 h (con copia local en el navegador).

  Si una API pública no responde, su simulador equivalente toma el relevo publicando
  entidades **FIWARE NGSI-LD** (Smart Data Models `TrafficFlowObserved`, `AirQualityObserved`,
  `BikeHireDockingStation`), el estándar de la plataforma VLCi del Ajuntament. Cuando la API
  vuelve, se recupera el dato real automáticamente.

- **Motor de reglas** (`src/core/rules.ts`) que cruza fuentes por distrito:
  - **R1** Incidente + atasco (+ lluvia → crítica) → ruta recomendada en metro desde la estación
    más cercana con servicio.
  - **R2** NO₂/PM10 altos + congestión → episodio de contaminación por tráfico.
  - **R3** Lluvia fuerte en distritos inundables (Poblats Marítims, Camins al Grau, Quatre
    Carreres); crítica si además hay metro interrumpido (riesgo DANA).
  - **R4** Cola de camiones en el puerto + congestión en los distritos marítimos.
  - **R5** Valenbisi vacío justo donde hay atasco → reequilibrado.
  - **R6** Retrasos en metro + congestión generalizada → movilidad degradada.

- **La ciudad en 3D**: edificios de OpenStreetMap con su altura real (vía OpenFreeMap, sin
  clave), puntos de interés (Ciutat de les Arts i les Ciències, Micalet, Mercat Central…),
  **ortofoto PNOA** del IGN y **relieve 3D** (Terrain Tiles de AWS Open Data) activables.
- **Todos los servicios públicos de la ciudad** (≈ miles de equipamientos de OpenStreetMap
  dentro del término municipal), en 8 categorías: sanidad (hospitales, centros de salud,
  farmacias…), educación, cultura, deporte, servicios sociales, mercados, administración y
  emergencias (policía, bomberos, ambulancias). Filtro por categoría, buscador y ficha con
  dirección, horario, teléfono y web. El motor de reglas los usa: R1 indica el hospital más
  cercano al incidente, y R2/R3 enumeran los colegios, centros sanitarios y residencias
  afectados del distrito.
- **Los 19 distritos** con sus límites oficiales (portal de datos abiertos) coloreados según la
  peor alerta activa. Los elementos se asignan a su distrito por punto-en-polígono; si el
  servicio no responde, se usan polígonos aproximados (Voronoi de los centroides).
- **Modelos BIM (IFC)** abiertos en el navegador con **web-ifc** (WebAssembly) y dibujados con
  three.js dentro del mapa, con orientación y posición ajustables. Incluye un modelo de ejemplo
  (`public/bim/ejemplo-terminal.ifc`, generado con `scripts/make-sample-ifc.mjs`). three.js y
  web-ifc solo se descargan al abrir un modelo.
- **Análisis de accidentes frente a la lluvia**: sube un CSV de accidentes (fecha y hora); la
  lluvia horaria se descarga de Open-Meteo (reanálisis ERA5) y se calcula la **razón de tasas
  ajustada por Mantel-Haenszel** (estratos: hora del día × laborable/fin de semana) con IC 95 %
  (Greenland–Robins), más la tasa por hora del día en seco y con lluvia. Incluye una demo con
  datos sintéticos de efecto conocido para validar el método.
- **Histórico de indicadores** (últimas 24 h, guardado en el navegador): congestión, NO₂,
  alertas y cola del puerto.
- **Escenarios** inyectables (accidente con lluvia, episodio de NO₂, colapso del puerto,
  avería de metro) para hacer una demo del motor de reglas.
- **Pensado para móviles**: simulación en un Web Worker, perfil de rendimiento automático según
  la GPU/CPU (pixel ratio, antialiasing, zoom mínimo de edificios = LOD), panel como hoja inferior.

## Arquitectura

```
APIs públicas (REST) ──┐                              ┌─> CityStore ─> Motor de reglas ─> Alertas
Web Worker (simulación)│  decodificadores por        │                                   │
  MQTT / GTFS-RT /     ├─ protocolo ─> EventBus ─────┤                                   v
  OPC UA / NGSI-LD ────┘  (src/adapters)             └─> React + MapLibre (mapa 3D, paneles)
```

Los simuladores (`src/sim/simulator.ts`) emiten exactamente el formato de cada protocolo
(`src/sim/protocols.ts`), y los decodificadores (`src/adapters/decoders.ts`) son los mismos que
usaría un driver real: para conectar un broker MQTT, un feed GTFS-RT o un Context Broker
FIWARE solo hay que cambiar el transporte.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests del motor de reglas, parsers y simulador
npm run build    # genera dist/ (estático)
```

## Despliegue

`dist/` es un sitio estático. El workflow `.github/workflows/deploy.yml` lo publica en
**GitHub Pages** al hacer push a `main` (activar en *Settings → Pages → Source: GitHub Actions*).
También funciona tal cual en Cloudflare Pages, Netlify o Vercel (comando `npm run build`,
directorio `dist`).

## Transparencia

- Datos reales: tráfico, Valenbisi, calidad del aire (portal de datos abiertos del Ajuntament
  de València) y meteorología (Open-Meteo). Cartografía © OpenStreetMap.
- Simulados: sensores IoT, Metrovalencia y PLCs del puerto, con el formato real de cada protocolo.
- Las coordenadas de estaciones de metro y elementos del puerto, y los centroides de distrito,
  son aproximados. El modelo BIM de ejemplo es genérico, no un edificio real del puerto.
- Ortofoto: PNOA © Instituto Geográfico Nacional. Relieve: Mapzen Terrain Tiles.

## Hoja de ruta

- Backend ligero (Cloudflare Workers/D1) para histórico compartido y conexión a un Context
  Broker FIWARE real (requiere una cuenta de Cloudflare).
- Ortofoto propia del ICV (Institut Cartogràfic Valencià) como alternativa al PNOA.
- Carga automática del conjunto de accidentalidad del Ajuntament en el análisis.
- Barrios (además de distritos) en el motor de reglas.
