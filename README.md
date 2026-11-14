# Gemelo Digital València

Gemelo digital 3D de la ciudad de València que funciona en el navegador. Integra fuentes
heterogéneas (datos abiertos municipales, meteorología, sensores IoT, metro y puerto) en un
**bus común**, las cruza con un **motor de reglas** por distrito y muestra el resultado sobre
la ciudad en 3D.

## Qué hace

- **7 fuentes en tiempo real, 5 protocolos** en un bus común (`src/core/bus.ts`):

  | Fuente | Protocolo | Origen |
  |---|---|---|
  | Tráfico en tiempo real | REST (ArcGIS) | **Real**: Geoportal del Ajuntament de València |
  | Valenbisi | REST (ArcGIS) | **Real**: Geoportal del Ajuntament de València |
  | Calidad del aire | REST (ArcGIS) | **Real**: Geoportal (red de vigilancia atmosférica) |
  | Meteorología | REST | **Real**: Open-Meteo |
  | Sensores IoT (ruido, incidencias) | MQTT | Simulado |
  | Metrovalencia | GTFS-Realtime | Simulado |
  | Port de València (PLCs) | OPC UA | Simulado |
  | Autobuses EMT (posición, rutas, paradas) | REST (ArcGIS) | **Real**: Geoportal (EMT València), cada 15 s |
  | Servicios públicos | REST (ArcGIS + CKAN) | **Real**: equipamientos municipales (Geoportal) y hospitales (opendata.vlci.valencia.es) |

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
- **Todos los servicios públicos de la ciudad**: los equipamientos municipales oficiales del
  Geoportal más los hospitales del portal de datos abiertos, en 8 categorías: sanidad,
  educación, cultura, deporte, servicios sociales, mercados, administración y emergencias. Filtro por categoría, buscador y ficha con
  dirección, horario, teléfono y web. El motor de reglas los usa: R1 indica el hospital más
  cercano al incidente, y R2/R3 enumeran los colegios, centros sanitarios y residencias
  afectados del distrito.
- **València en vivo (autobuses de la EMT)**: posición real de cada autobús cada 15 s,
  animada de forma continua entre lecturas, con **estela**, etiqueta «línea · km/h · rumbo»,
  **modelo 3D** al acercarse, trazado de las líneas con brillo y paradas al acercarse (con
  enlace a próximas llegadas). La EMT solo publica posición, línea y trayecto: la velocidad
  y el rumbo se **reconstruyen** siguiendo cada autobús entre lecturas
  (`src/transit/emt.ts`). Modo de color por movimiento o por velocidad; al tocar un autobús
  se resalta su línea.
- **Estética y cámara**: mapa en **modo noche** (por defecto) o día, atajos **«Ir a…»**,
  **girar alrededor** y **modo grabación** (tecla R) que deja solo el mapa para grabar vídeos.
- **Vista fotorrealista 3D (Google)**: la ciudad con los «Photorealistic 3D Tiles» de
  Google (fotogrametría aérea), dibujados con deck.gl dentro del mapa y con los datos del
  gemelo encima. Requiere una clave propia (ver *Vista fotorrealista* más abajo).
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

## Fuentes y comprobación

Los datos municipales se leen del **Geoportal del Ajuntament** (`geoportal.valencia.es`,
capas `OPENDATA`), que es de donde se alimenta el portal de datos abiertos
`opendata.vlci.valencia.es` y admite peticiones desde el navegador. El workflow
**Comprobar APIs** (`.github/workflows/check-apis.yml`, manual y semanal) ejecuta los
adaptadores de la app contra las APIs reales y falla si alguna deja de responder.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests del motor de reglas, parsers y simulador
npm run build    # genera dist/ (estático)
```

## Despliegue

`dist/` es un sitio estático. El workflow `.github/workflows/deploy.yml` lo publica en
**GitHub Pages** en cada push a la rama por defecto del repositorio (activar una vez en
*Settings → Pages → Source: GitHub Actions*). Queda en
`https://<usuario>.github.io/<repositorio>/` y se puede abrir desde el móvil e instalar en
la pantalla de inicio («Añadir a pantalla de inicio»).
También funciona tal cual en Cloudflare Pages, Netlify o Vercel (comando `npm run build`,
directorio `dist`).

## Vista fotorrealista (Google Photorealistic 3D Tiles)

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto y activa la
   facturación (la Map Tiles API tiene un uso mensual gratuito; consulta los precios vigentes).
2. *APIs y servicios → Biblioteca*: activa **Map Tiles API**.
3. *APIs y servicios → Credenciales → Crear credenciales → Clave de API* y restríngela:
   - **Restricción de aplicación**: sitios web, añadiendo
     `https://jtorresestiguin-cloud.github.io/*` (y `http://localhost:5173/*` para desarrollo).
   - **Restricción de API**: solo *Map Tiles API*.
4. Usa la clave de una de estas dos formas:
   - **Solo en tu navegador**: pestaña *En vivo y capas → Vista fotorrealista 3D → Guardar y activar*.
   - **Para todos los visitantes**: en GitHub, *Settings → Secrets and variables → Actions →
     New repository secret*, nombre `GOOGLE_MAPS_KEY`, y vuelve a ejecutar el workflow de
     despliegue. La clave queda dentro del JavaScript publicado (es una clave de navegador),
     por eso es imprescindible la restricción por dominio del paso 3.

Condiciones de Google que respeta la app: se muestra «Google» y las atribuciones de las
teselas visibles, y mientras la vista está activa se oculta el mapa base de OpenStreetMap
(los modelos de Google no se pueden combinar con otros mapas base). deck.gl (~1,5 MB) solo
se descarga al activar la vista.

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
