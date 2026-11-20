/**
 * Fichas breves de los monumentos que aparecen en las visitas guiadas.
 * La lista se construye a partir de las paradas de CURATED_TOURS (sin duplicados);
 * aquí solo se añade un texto corto y, cuando se conoce, la época y la autoría.
 */
import type { LngLat } from '../core/types';
import { CURATED_TOURS } from './curated';
import type { TourStop } from './tours';

export interface MonumentInfo {
  /** época o fecha, p. ej. «1392–1398» */
  when?: string;
  who?: string;
  text: string;
}

export interface Monument {
  id: string;
  name: string;
  lngLat: LngLat;
  info: MonumentInfo;
  /** encuadre de cámara de la parada original */
  view: Pick<TourStop, 'zoom' | 'pitch' | 'bearing'>;
  /** visitas en las que aparece y en qué parada */
  tours: { id: string; title: string; stop: number }[];
}

/** Paradas que son zonas amplias, no un monumento concreto. */
const AREAS = new Set(['Ciutat Vella', 'Ciudad de las Artes y las Ciencias', 'Barrio del Mercat']);

const INFO: Record<string, MonumentInfo> = {
  'Torres de Serranos': { when: '1392–1398', who: 'Pere Balaguer', text: 'Puerta principal de la muralla medieval. Desde lo alto se hace la Crida que abre las Fallas.' },
  'Plaza de la Virgen': { text: 'Antiguo foro romano. Cada jueves se reúne aquí, en la puerta de los Apóstoles, el Tribunal de las Aguas.' },
  'Catedral y Miguelete': { when: 'desde 1262 · torre 1381–1429', text: 'Mezcla de románico, gótico y barroco. Subiendo los 207 escalones del Miguelete se ve toda la ciudad.' },
  "L'Almoina": { text: 'Bajo una cubierta de vidrio se ven restos romanos, visigodos e islámicos: el origen de València.' },
  'Lonja de la Seda': { when: '1482–1548', who: 'Pere Compte', text: 'Lonja de comercio con columnas helicoidales. Patrimonio de la Humanidad desde 1996.' },
  'Torres de Quart': { when: 'siglo XV', text: 'Otra de las puertas de la muralla. Aún conserva en la piedra los impactos de los cañonazos de 1808.' },
  'Estación del Norte': { when: '1906–1917', who: 'Demetrio Ribes', text: 'Decorada con naranjas, azahar y mosaicos; su vestíbulo es de los más bellos de España.' },
  'Plaza del Ayuntamiento': { text: 'Rodeada por el Ayuntamiento y el edificio de Correos. En Fallas acoge las mascletàs.' },
  'Mercado Central': { when: '1914–1928', who: 'Alejandro Soler y Francesc Guàrdia', text: 'Uno de los mercados de abastos más grandes de Europa, con cúpulas, hierro y vidrieras.' },
  'Casa de los Dragones': { when: '1901', who: 'José Manuel Cortina', text: 'Edificio de aire neogótico con dragones esculpidos en la fachada.' },
  'Mercado de Colón': { when: '1914–1916', who: 'Francisco Mora', text: 'Antiguo mercado modernista del Ensanche, hoy lleno de cafés y restaurantes.' },
  'Casa Ferrer': { text: 'Fachada decorada con motivos florales y cerámica, muy típica del modernismo valenciano.' },
  'Edificio del Reloj': { when: '1916', text: 'Antigua estación marítima con su torre-reloj, símbolo del puerto. A su lado, los Tinglados modernistas.' },
  'Parque de Cabecera': { text: 'Inicio del Jardín del Turia, con lago navegable y el mirador del Morro. Junto a Bioparc.' },
  'Puente de Serranos': { when: 'siglo XVI', text: 'Puente de piedra sobre el antiguo cauce, frente a las Torres de Serranos.' },
  'Museo de Bellas Artes': { text: 'Pinacoteca con obras de Velázquez, Goya, El Greco y una gran colección de Sorolla.' },
  'Puente de la Exposición': { when: '1995', who: 'Santiago Calatrava', text: 'Conocido como «la Peineta» por su arco inclinado. Debajo está la estación de metro Alameda.' },
  'Palau de la Música': { when: '1987', who: 'José María de Paredes', text: 'Auditorio de vidrio y bóveda junto al Jardín del Turia.' },
  'Parque Gulliver': { text: 'Un Gulliver tumbado de 70 metros cuyo cuerpo es un gran tobogán para niños.' },
  'Palau de les Arts': { when: '2005', who: 'Santiago Calatrava', text: 'Teatro de la ópera, cubierto por una enorme «pluma» metálica.' },
  "L'Hemisfèric": { when: '1998', who: 'Santiago Calatrava', text: 'Con forma de ojo que se abre y se cierra. Alberga un cine de gran formato y planetario.' },
  "L'Umbracle": { when: '2001', who: 'Santiago Calatrava', text: 'Paseo-jardín bajo arcos blancos con plantas autóctonas.' },
  'Museo de las Ciencias': { when: '2000', who: 'Santiago Calatrava', text: 'Museo interactivo de ciencia de unos 220 metros de largo.' },
  "Puente de l'Assut d'Or y l'Àgora": { when: '2008–2009', who: 'Santiago Calatrava', text: 'El mástil del puente, de 125 metros, es el punto más alto de la ciudad.' },
  "L'Oceanogràfic": { when: '2003', who: 'Félix Candela', text: 'El mayor acuario de Europa, con más de 500 especies marinas.' },
  'Antigua estación del Grau': { text: 'Estación del barrio portuario. Punto de partida de las rutas del puerto.' },
  'Atarazanas del Grau': { when: 'siglo XIV', text: 'Astilleros góticos donde se construían barcos. Hoy, sala de exposiciones.' },
  'Veles e Vents': { when: '2006', who: 'David Chipperfield y Fermín Vázquez', text: "Construido para la America's Cup de 2007, con terrazas que vuelan sobre la dársena." },
  'Mercado del Cabanyal': { text: 'Mercado del barrio marinero del Cabanyal, famoso por sus casas con fachadas de azulejo.' },
  'Balneario Las Arenas': { when: '1898', text: 'Histórico balneario frente a la playa, hoy convertido en hotel.' },
  'Playa de la Malva-rosa': { text: 'La playa urbana más conocida de València, con su paseo marítimo.' },
  'Monumento a Joaquín Sorolla': { text: 'Homenaje al pintor en el barrio donde pintó muchas de sus escenas de mar.' },
  'Casa Museo Blasco Ibáñez': { text: 'Reconstrucción del chalet donde el escritor vivía y escribía frente al mar.' },
  'Refugio de Serranos': { when: '1936–1939', text: 'Refugio público de la Guerra Civil, musealizado. Se visita con reserva.' },
  'Refugio del Palau de Benicarló': { text: 'Palacio gótico, hoy Corts Valencianes. En la guerra alojó la Presidencia del Gobierno de la República.' },
  'Refugio de la plaza de la Universidad': { when: '1936–1939', text: 'Refugio público bajo la plaza, junto a La Nau, sede histórica de la Universitat.' },
  'Refugio del Ayuntamiento': { when: '1936–1939', text: 'Refugio del antiguo grupo escolar del Ayuntamiento. Se visita con reserva.' },
  'Refugio del Instituto Luis Vives': { when: '1936–1939', text: 'Refugio construido para proteger a los alumnos durante los bombardeos.' },
  'Refugio del Mercado de Ruzafa': { when: '1936–1939', text: 'Refugio público bajo la plaza del mercado del barrio.' },
  'Refugio de Bombas Gens': { text: 'Refugio de una fábrica art déco de 1930, hoy centro de arte. Se puede visitar.' },
  'Tinglados 4 y 5': { when: 'principios s. XX', text: 'Cobertizos del puerto con decoración modernista, junto a la dársena.' },
  'Grúa-Cabria': { text: 'Antigua grúa de carga del puerto, conservada como patrimonio industrial.' },
  'Edificio de la Aduana': { text: 'Antigua aduana del puerto, en la plaza que lleva su nombre.' },
  'Museo del Arroz': { text: 'Molino arrocero de principios del siglo XX que conserva su maquinaria original.' },
  'Chimenea del almacén de vinos Garrigós': { text: 'Chimenea de ladrillo, testigo del antiguo comercio de vino del puerto.' },
  'Harineras Levantinas': { text: 'Antigua fábrica de harinas del barrio portuario.' },
  'Cros S.A.': { text: 'Antigua fábrica de abonos químicos, parte del pasado industrial del Grau.' },
  Pinedo: { text: 'Barrio de huerta y mar. La Barraca la Genuina muestra la vivienda tradicional valenciana.' },
  'El Saler': { text: 'Pueblo de huerta y pesca a orillas del Parque Natural de la Albufera.' },
  'La Devesa del Saler': { text: 'Bosque de pinos y dunas entre el lago y el mar.' },
  'Lago de la Albufera': { text: 'Laguna de más de 2.000 hectáreas rodeada de arrozales, famosa por sus puestas de sol.' },
  'El Palmar': { text: 'Isla de pescadores en plena Albufera, cuna de la paella y del all i pebre.' },
};

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** distancia aproximada en metros */
const dist = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 86_000, (a[1] - b[1]) * 111_000);

function build(): Monument[] {
  const list: Monument[] = [];
  for (const tour of CURATED_TOURS) {
    tour.stops.forEach((s, i) => {
      if (AREAS.has(s.name)) return;
      const ref = { id: tour.id, title: tour.title, stop: i };
      const same = list.find((m) => m.name === s.name || dist(m.lngLat, s.center) < 35);
      if (same) {
        if (!same.tours.some((t) => t.id === tour.id)) same.tours.push(ref);
        return;
      }
      list.push({
        id: slug(s.name),
        name: s.name,
        lngLat: s.center,
        info: INFO[s.name] ?? { text: s.subtitle ?? '' },
        view: { zoom: s.zoom, pitch: s.pitch, bearing: s.bearing },
        tours: [ref],
      });
    });
  }
  return list;
}

export const MONUMENTS: Monument[] = build();

export const monumentById = (id: string) => MONUMENTS.find((m) => m.id === id);

export const monumentsGeo = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: MONUMENTS.map((m) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: m.lngLat }, properties: { kind: 'monument', id: m.id, name: m.name } })),
});
