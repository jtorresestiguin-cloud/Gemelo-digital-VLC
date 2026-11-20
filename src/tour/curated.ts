/**
 * Visitas guiadas temáticas por València.
 *
 * Paradas elegidas a partir de las rutas oficiales de Visit València y del Ajuntament
 * (centro histórico, modernismo, Jardín del Turia, poblados marítimos, Albufera, rutas
 * biográficas, refugios y patrimonio industrial del Grau). Las coordenadas salen de las
 * capas oficiales del Geoportal (Turismo: monumentos, recursos turísticos, refugios y
 * edificaciones industriales).
 */
import type { Tour } from './tours';

const T = (title: string, id: string, description: string, stops: Tour['stops']): Tour => ({ id, title, description, stops });

export const CURATED_TOURS: Tour[] = [
  T('València gótica y medieval', 'gotica', 'De las Torres de Serranos a las de Quart: la ruta clásica del centro histórico (unas 2 h a pie).', [
    { name: 'Ciutat Vella', subtitle: 'El núcleo donde nació València', center: [-0.3770, 39.4760], zoom: 15.3, pitch: 55, bearing: -20, hold: 2 },
    { name: 'Torres de Serranos', subtitle: 'Puerta de la muralla medieval · Pere Balaguer, 1392–1398', center: [-0.37601, 39.47918], zoom: 17.6, pitch: 64, bearing: 160, hold: 4 },
    { name: 'Plaza de la Virgen', subtitle: 'Basílica de los Desamparados y Palau de la Generalitat', center: [-0.37530, 39.47640], zoom: 17.6, pitch: 62, bearing: 210, hold: 3.5 },
    { name: 'Catedral y Miguelete', subtitle: 'Campanario gótico de 1381–1429 · 207 escalones hasta el mirador', center: [-0.37540, 39.47550], zoom: 17.7, pitch: 66, bearing: 250, hold: 4.5 },
    { name: "L'Almoina", subtitle: 'Centro arqueológico: las raíces romanas de Valentia', center: [-0.37445, 39.47624], zoom: 18, pitch: 60, bearing: 300, hold: 3 },
    { name: 'Lonja de la Seda', subtitle: 'Gótico civil · Patrimonio de la Humanidad por la UNESCO (1996)', center: [-0.37840, 39.47441], zoom: 17.8, pitch: 64, bearing: 30, hold: 4.5 },
    { name: 'Torres de Quart', subtitle: 'La otra puerta medieval que se conserva · siglo XV', center: [-0.38394, 39.47571], zoom: 17.6, pitch: 64, bearing: 90, hold: 4 },
  ]),

  T('València modernista', 'modernista', 'Estaciones, mercados y edificios de principios del siglo XX, del Ensanche al puerto.', [
    { name: 'Estación del Norte', subtitle: 'Demetrio Ribes, inaugurada en 1917', center: [-0.37723, 39.46684], zoom: 17.6, pitch: 64, bearing: 200, hold: 4 },
    { name: 'Plaza del Ayuntamiento', subtitle: 'Casa Consistorial y edificio de Correos', center: [-0.37620, 39.46965], zoom: 17.2, pitch: 62, bearing: 330, hold: 3.5 },
    { name: 'Mercado Central', subtitle: 'Modernismo valenciano, inaugurado en 1928', center: [-0.37891, 39.47356], zoom: 17.8, pitch: 64, bearing: 20, hold: 4 },
    { name: 'Casa de los Dragones', subtitle: 'Fachada modernista con dragones en la esquina', center: [-0.36990, 39.47019], zoom: 18.2, pitch: 62, bearing: 120, hold: 3 },
    { name: 'Mercado de Colón', subtitle: 'Francisco Mora, 1914–1916 · icono del Ensanche', center: [-0.36840, 39.46892], zoom: 17.8, pitch: 64, bearing: 160, hold: 4 },
    { name: 'Casa Ferrer', subtitle: 'Edificio de viviendas modernista del Ensanche', center: [-0.37223, 39.46710], zoom: 18.2, pitch: 62, bearing: 220, hold: 3 },
    { name: 'Edificio del Reloj', subtitle: 'Antigua estación marítima del puerto · torre de 1916', center: [-0.33175, 39.46019], zoom: 17.6, pitch: 64, bearing: 60, hold: 4 },
  ]),

  T('Jardín del Turia', 'turia', 'El antiguo cauce del río: nueve kilómetros de jardín de oeste a este, hasta la Ciudad de las Artes.', [
    { name: 'Parque de Cabecera', subtitle: 'Inicio del jardín · junto a Bioparc', center: [-0.40820, 39.47700], zoom: 16.4, pitch: 60, bearing: 90, hold: 3 },
    { name: 'Puente de Serranos', subtitle: 'Uno de los puentes históricos sobre el viejo cauce', center: [-0.37531, 39.48076], zoom: 17.2, pitch: 62, bearing: 120, hold: 3 },
    { name: 'Museo de Bellas Artes', subtitle: 'Junto a los Jardines del Real (Viveros)', center: [-0.37168, 39.47951], zoom: 17.2, pitch: 62, bearing: 150, hold: 3 },
    { name: 'Puente de la Exposición', subtitle: 'Santiago Calatrava, conocido como «la Peineta»', center: [-0.36600, 39.47313], zoom: 17.4, pitch: 62, bearing: 140, hold: 3 },
    { name: 'Palau de la Música', subtitle: 'Auditorio sobre el jardín, entre el Ensanche y el río', center: [-0.36054, 39.46615], zoom: 17.4, pitch: 62, bearing: 160, hold: 3 },
    { name: 'Parque Gulliver', subtitle: 'El gigante tumbado de 70 metros para jugar', center: [-0.35967, 39.46300], zoom: 17.8, pitch: 62, bearing: 180, hold: 3.5 },
    { name: 'Ciudad de las Artes y las Ciencias', subtitle: 'El final del Turia · Calatrava y Candela', center: [-0.35312, 39.45630], zoom: 15.8, pitch: 62, bearing: 120, hold: 4 },
  ]),

  T('Ciudad de las Artes y las Ciencias', 'arts', 'El conjunto de Santiago Calatrava y Félix Candela, edificio a edificio.', [
    { name: 'Palau de les Arts', subtitle: 'Teatro de ópera · Calatrava', center: [-0.35520, 39.45751], zoom: 17.6, pitch: 64, bearing: 300, hold: 4 },
    { name: "L'Hemisfèric", subtitle: 'El primer edificio del conjunto, abierto en 1998', center: [-0.35431, 39.45699], zoom: 17.8, pitch: 62, bearing: 200, hold: 4 },
    { name: "L'Umbracle", subtitle: 'Paseo-jardín cubierto con vegetación mediterránea', center: [-0.35358, 39.45558], zoom: 17.8, pitch: 60, bearing: 120, hold: 3 },
    { name: 'Museo de las Ciencias', subtitle: 'El esqueleto blanco de hormigón y vidrio', center: [-0.35075, 39.45507], zoom: 17.6, pitch: 64, bearing: 30, hold: 4 },
    { name: "Puente de l'Assut d'Or y l'Àgora", subtitle: 'El mástil en forma de arpa de 125 metros', center: [-0.35090, 39.45380], zoom: 17.4, pitch: 64, bearing: 330, hold: 3.5 },
    { name: "L'Oceanogràfic", subtitle: 'Las cubiertas de Félix Candela · el gran acuario de Europa', center: [-0.34814, 39.45228], zoom: 17.2, pitch: 62, bearing: 40, hold: 4 },
  ]),

  T('La València marítima', 'maritima', 'Del puerto al Cabanyal y la Malva-rosa: la ciudad que mira al Mediterráneo.', [
    { name: 'Antigua estación del Grau', subtitle: 'Donde llegaba el trenet del puerto', center: [-0.33264, 39.45902], zoom: 17.8, pitch: 62, bearing: 60, hold: 3 },
    { name: 'Edificio del Reloj y Tinglados', subtitle: 'Estación marítima (1916) y cobertizos modernistas de 1911–1923', center: [-0.33175, 39.46019], zoom: 17.2, pitch: 64, bearing: 100, hold: 4 },
    { name: 'Atarazanas del Grau', subtitle: 'Los astilleros medievales del puerto', center: [-0.33359, 39.46131], zoom: 18, pitch: 62, bearing: 150, hold: 3 },
    { name: 'Veles e Vents', subtitle: 'David Chipperfield y Fermín Vázquez · icono de La Marina', center: [-0.32428, 39.46103], zoom: 17.4, pitch: 64, bearing: 200, hold: 4 },
    { name: 'Mercado del Cabanyal', subtitle: 'El corazón del barrio marinero', center: [-0.33329, 39.46750], zoom: 17.8, pitch: 62, bearing: 250, hold: 3 },
    { name: 'Balneario Las Arenas', subtitle: 'Antiguo balneario en primera línea de mar', center: [-0.32491, 39.46663], zoom: 17.6, pitch: 62, bearing: 300, hold: 3 },
    { name: 'Playa de la Malva-rosa', subtitle: 'Casi dos kilómetros de arena dorada', center: [-0.32462, 39.47727], zoom: 16.2, pitch: 62, bearing: 330, hold: 4 },
  ]),

  T('Sorolla y Blasco Ibáñez', 'sorolla-blasco', 'Ruta biográfica por los lugares de la vida y obra del pintor de la luz y del escritor.', [
    { name: 'Barrio del Mercat', subtitle: 'Sorolla (1863) y Blasco Ibáñez (1867) nacieron en este entorno', center: [-0.37869, 39.47416], zoom: 17.4, pitch: 62, bearing: 0, hold: 4 },
    { name: 'Museo de Bellas Artes', subtitle: 'Una de las grandes colecciones de Sorolla', center: [-0.37168, 39.47951], zoom: 17.6, pitch: 62, bearing: 80, hold: 3.5 },
    { name: 'Monumento a Joaquín Sorolla', subtitle: 'En el Cabanyal, el barrio de sus escenas de mar', center: [-0.32982, 39.46336], zoom: 18, pitch: 62, bearing: 120, hold: 3 },
    { name: 'Playa de la Malva-rosa', subtitle: 'La luz y el mar que pintaba Sorolla', center: [-0.32462, 39.47727], zoom: 16.6, pitch: 62, bearing: 30, hold: 4 },
    { name: 'Casa Museo Blasco Ibáñez', subtitle: 'El chalet del escritor frente al mar', center: [-0.32578, 39.48263], zoom: 18, pitch: 62, bearing: 250, hold: 4 },
  ]),

  T('Refugios de la Guerra Civil', 'refugios', 'València fue capital de la República (1936–1937) y se llenó de refugios antiaéreos; hoy hay más de 80 catalogados.', [
    { name: 'Refugio de Serranos', subtitle: 'Calle Serranos, 25 · refugio público visitable', center: [-0.37667, 39.47834], zoom: 18, pitch: 62, bearing: 200, hold: 4 },
    { name: 'Refugio del Palau de Benicarló', subtitle: 'Hoy Corts Valencianes · sede del Gobierno de la República', center: [-0.37441, 39.47795], zoom: 18, pitch: 62, bearing: 140, hold: 3.5 },
    { name: 'Refugio de la plaza de la Universidad', subtitle: 'Junto a La Nau, bajo la plaza', center: [-0.37349, 39.47208], zoom: 18, pitch: 62, bearing: 60, hold: 3 },
    { name: 'Refugio del Ayuntamiento', subtitle: 'Antiguo grupo escolar, bajo la Casa Consistorial · visitable', center: [-0.37758, 39.46991], zoom: 18, pitch: 62, bearing: 320, hold: 4 },
    { name: 'Refugio del Instituto Luis Vives', subtitle: 'Refugio escolar en pleno centro', center: [-0.37823, 39.46840], zoom: 18, pitch: 62, bearing: 250, hold: 3 },
    { name: 'Refugio del Mercado de Ruzafa', subtitle: 'Refugio público bajo el mercado del barrio', center: [-0.37154, 39.46215], zoom: 18, pitch: 62, bearing: 180, hold: 3 },
    { name: 'Refugio de Bombas Gens', subtitle: 'Refugio de la antigua fábrica, hoy centro de arte', center: [-0.38504, 39.48565], zoom: 18, pitch: 62, bearing: 30, hold: 4 },
  ]),

  T('Patrimonio industrial del Grau', 'industrial-grau', 'La ruta municipal de naves, almacenes, chimeneas y muelles del barrio portuario.', [
    { name: 'Estación del Grau', subtitle: 'Avda. del Ingeniero Manuel Soto · origen de la ruta del puerto', center: [-0.33226, 39.45828], zoom: 17.8, pitch: 62, bearing: 30, hold: 3 },
    { name: 'Tinglados 4 y 5', subtitle: 'Cobertizos portuarios modernistas sobre el muelle', center: [-0.33133, 39.45821], zoom: 17.8, pitch: 64, bearing: 90, hold: 3.5 },
    { name: 'Grúa-Cabria', subtitle: 'Antigua grúa de carga del puerto', center: [-0.32944, 39.46200], zoom: 18, pitch: 62, bearing: 150, hold: 3 },
    { name: 'Edificio de la Aduana', subtitle: 'Plaza de la Aduana · Junta de Obras del Puerto', center: [-0.32663, 39.46269], zoom: 18, pitch: 62, bearing: 210, hold: 3 },
    { name: 'Museo del Arroz', subtitle: 'Antiguo molino arrocero del Grau', center: [-0.33189, 39.46317], zoom: 18.2, pitch: 62, bearing: 270, hold: 3.5 },
    { name: 'Chimenea del almacén de vinos Garrigós', subtitle: 'Calle Serrería · inicio de la ruta norte', center: [-0.33708, 39.46269], zoom: 18.2, pitch: 64, bearing: 300, hold: 3 },
    { name: 'Harineras Levantinas', subtitle: 'Calle Juan Verdeguer · ruta sur de fábricas y almacenes', center: [-0.33659, 39.45852], zoom: 18, pitch: 62, bearing: 0, hold: 3 },
    { name: 'Cros S.A.', subtitle: 'Antigua fábrica química en la Avenida de Francia', center: [-0.34204, 39.45772], zoom: 18, pitch: 62, bearing: 60, hold: 3 },
  ]),

  T('La Albufera y la Devesa', 'albufera', 'Del barrio de Pinedo al Parque Natural: arrozales, dunas y el lago (mejor al atardecer).', [
    { name: 'Pinedo', subtitle: 'Barraca la Genuina y la València de la huerta', center: [-0.34070, 39.42273], zoom: 15.8, pitch: 60, bearing: 180, hold: 3 },
    { name: 'El Saler', subtitle: 'Núcleo histórico al borde del Parque Natural', center: [-0.33327, 39.38251], zoom: 16, pitch: 60, bearing: 200, hold: 3 },
    { name: 'La Devesa del Saler', subtitle: 'Pinar y dunas entre el lago y el mar', center: [-0.32600, 39.38177], zoom: 15.6, pitch: 62, bearing: 120, hold: 3.5 },
    { name: 'Lago de la Albufera', subtitle: 'La gran laguna de agua dulce del Parque Natural', center: [-0.31638, 39.34919], zoom: 13.6, pitch: 62, bearing: 220, hold: 4.5 },
    { name: 'El Palmar', subtitle: 'Pueblo de pescadores, barcas y arroz', center: [-0.31796, 39.30990], zoom: 16, pitch: 62, bearing: 330, hold: 4 },
  ]),
];
