// Genera un IFC4 sencillo (nave logística + torre de control) para probar el visor BIM.
// Uso: node scripts/make-sample-ifc.mjs > public/bim/ejemplo-terminal.ifc
const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
let g = 0;
const gid = () => { let n = ++g, s = ''; for (let i = 0; i < 22; i++) { s = ALPHA[(n + i * 7) % 64] + s; n = Math.floor(n / 64) || i + g; } return `'${s}'`; };
let id = 0;
const lines = [];
const e = (txt) => { lines.push(`#${++id}=${txt};`); return `#${id}`; };

const origin = e('IFCCARTESIANPOINT((0.,0.,0.))');
const zdir = e('IFCDIRECTION((0.,0.,1.))');
const xdir = e('IFCDIRECTION((1.,0.,0.))');
const world = e(`IFCAXIS2PLACEMENT3D(${origin},${zdir},${xdir})`);
const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
const units = e(`IFCUNITASSIGNMENT((${e('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')},${e('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')}))`);
const project = e(`IFCPROJECT(${gid()},$,'Gemelo Digital VLC - modelo de ejemplo',$,$,$,$,(${ctx}),${units})`);
const sitePl = e(`IFCLOCALPLACEMENT($,${world})`);
const site = e(`IFCSITE(${gid()},$,'Parcela',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
const bldPl = e(`IFCLOCALPLACEMENT(${sitePl},${world})`);
const bld = e(`IFCBUILDING(${gid()},$,'Terminal (ejemplo)',$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
const stPl = e(`IFCLOCALPLACEMENT(${bldPl},${world})`);
const storey = e(`IFCBUILDINGSTOREY(${gid()},$,'Planta baja',$,$,${stPl},$,$,.ELEMENT.,0.)`);

function box(name, x, y, z, w, d, h, rgb) {
  const p = e(`IFCCARTESIANPOINT((${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}))`);
  const ax = e(`IFCAXIS2PLACEMENT3D(${p},${zdir},${xdir})`);
  const pl = e(`IFCLOCALPLACEMENT(${stPl},${ax})`);
  const p2 = e('IFCCARTESIANPOINT((0.,0.))');
  const ax2 = e(`IFCAXIS2PLACEMENT2D(${p2},$)`);
  const prof = e(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ax2},${w.toFixed(1)},${d.toFixed(1)})`);
  const solid = e(`IFCEXTRUDEDAREASOLID(${prof},${world},${zdir},${h.toFixed(1)})`);
  const colour = e(`IFCCOLOURRGB($,${rgb.map((c) => c.toFixed(2)).join(',')})`);
  const shading = e(`IFCSURFACESTYLESHADING(${colour},0.)`);
  const style = e(`IFCSURFACESTYLE($,.BOTH.,(${shading}))`);
  e(`IFCSTYLEDITEM(${solid},(${style}),$)`);
  const rep = e(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${solid}))`);
  const shape = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  return e(`IFCBUILDINGELEMENTPROXY(${gid()},$,'${name}',$,$,${pl},${shape},$,$)`);
}

const elems = [
  box('Nave logistica', 0, 0, 0, 80, 36, 12, [0.78, 0.80, 0.84]),
  box('Cubierta', 0, 0, 12, 82, 38, 1, [0.20, 0.45, 0.70]),
  box('Oficinas', -50, 0, 0, 18, 24, 16, [0.92, 0.88, 0.80]),
  box('Torre de control (fuste)', 55, 20, 0, 6, 6, 32, [0.85, 0.85, 0.88]),
  box('Torre de control (cabina)', 55, 20, 32, 11, 11, 5, [0.15, 0.55, 0.75]),
];
e(`IFCRELAGGREGATES(${gid()},$,$,$,${project},(${site}))`);
e(`IFCRELAGGREGATES(${gid()},$,$,$,${site},(${bld}))`);
e(`IFCRELAGGREGATES(${gid()},$,$,$,${bld},(${storey}))`);
e(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${gid()},$,$,$,(${elems.join(',')}),${storey})`);

process.stdout.write([
  'ISO-10303-21;', 'HEADER;',
  "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
  "FILE_NAME('ejemplo-terminal.ifc','2026-11-11T00:00:00',('Gemelo Digital VLC'),(''),'','','');",
  "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...lines, 'ENDSEC;', 'END-ISO-10303-21;', '',
].join('\n'));
