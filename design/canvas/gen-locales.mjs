// Generates the locale variants of Main from the English artboard.
//
// The point is the longest-language check: pt-BR and neutral es against the
// same layout, at identical sizes, to find what breaks before a component is
// written. Terminal output stays English on purpose, because remote text is
// never translated.
//
// Every replacement must match exactly once. A pair that matches zero times
// means the artboard changed and this file did not; a pair that matches twice
// means a string is doing two jobs. Both are failures, not warnings.
//
// Strings come from src/locales/, never from here. If a value below is not in
// the catalogue, the artboard is inventing copy.

import fs from 'fs';

function make(src, out, pairs) {
  let s = fs.readFileSync(src, 'utf8');
  for (const [a, b] of pairs) {
    const n = s.split(a).length - 1;
    if (n !== 1) {
      console.error(`FAIL ${out}: ${n} matches for ${JSON.stringify(a.slice(0, 70))}`);
      process.exit(1);
    }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(out, s);
  console.log('wrote', out);
}

/* sessions.title, sessions.filter and status.sync.on come from the catalogue.
   PRODUCTION and STAGING are group names a user typed, translated here only
   because the artboard invents them and the check is about length. */
const ptBr = [
  ['>SESSIONS<', '>SESSÕES<'],
  ['>Filter sessions<', '>Filtrar sessões<'],
  ['>PRODUCTION<', '>PRODUÇÃO<'],
  ['>STAGING<', '>HOMOLOGAÇÃO<'],
  ['>SYNC OFF<', '>SINC DESLIGADO<'],
];

const es = [
  ['>SESSIONS<', '>SESIONES<'],
  ['>Filter sessions<', '>Filtrar sesiones<'],
  ['>PRODUCTION<', '>PRODUCCIÓN<'],
  ['>STAGING<', '>PREPRODUCCIÓN<'],
  ['>SYNC OFF<', '>SINC APAGADO<'],
];

make('Main.dc.html', 'MainPtBr.dc.html', ptBr);
make('Main.dc.html', 'MainEs.dc.html', es);
