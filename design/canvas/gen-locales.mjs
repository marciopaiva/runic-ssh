import fs from 'fs';

function make(src, out, pairs) {
  let s = fs.readFileSync(src, 'utf8');
  for (const [a, b] of pairs) {
    const n = s.split(a).length - 1;
    if (n !== 1) { console.error(`FAIL ${out}: ${n} matches for ${JSON.stringify(a.slice(0, 70))}`); process.exit(1); }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(out, s);
  console.log('wrote', out);
}

const mainPt = [
  ['>SESSIONS<', '>SESSÕES<'],
  ['>PRODUCTION<', '>PRODUÇÃO<'],
  ['>STAGING<', '>HOMOLOGAÇÃO<'],
  ['>tunnel :5432<', '>túnel :5432<'],
  ['>key changed<', '>chave alterada<'],
  ['>ed25519 verified<', '>ed25519 verificada<'],
  ['>Connected<', '>Conectado<'],
  ['>Commands<', '>Comandos<'],
  ['>2.4 MB / 118 KB<', '>2,4 MB / 118 KB<'],
];
const mainEs = [
  ['>SESSIONS<', '>SESIONES<'],
  ['>PRODUCTION<', '>PRODUCCIÓN<'],
  ['>STAGING<', '>PREPRODUCCIÓN<'],
  ['>tunnel :5432<', '>túnel :5432<'],
  ['>key changed<', '>clave cambiada<'],
  ['>ed25519 verified<', '>ed25519 verificada<'],
  ['>Connected<', '>Conectado<'],
  ['>Commands<', '>Comandos<'],
  ['>2.4 MB / 118 KB<', '>2,4 MB / 118 KB<'],
];

const hkPt = [
  ['>Unknown host key<', '>Chave de host desconhecida<'],
  ['Runic SSH has never connected to ', 'O Runic SSH nunca se conectou a '],
  [' before. Confirm the fingerprint through a channel you already trust — not through this connection.',
   ' antes. Confirme a impressão digital por um canal em que você já confia — não por esta conexão.'],
  ['>KEY TYPE<', '>TIPO DE CHAVE<'],
  ['>SHA256 FINGERPRINT<', '>IMPRESSÃO DIGITAL SHA256<'],
  ['>I verified this fingerprint out of band<', '>Verifiquei esta impressão digital por outro canal<'],
  ['>From the provider console, a configuration repository, or someone who runs the host.<',
   '>No console do provedor, num repositório de configuração, ou com quem administra o host.<'],
  ['>Saved to <span class="mono">known_hosts</span>', '>Será salva em <span class="mono">known_hosts</span>'],
  ['>Cancel<', '>Cancelar<'],
  ['>Connect once<', '>Conectar uma vez<'],
  ['>Trust and connect<', '>Confiar e conectar<'],
];
const hkEs = [
  ['>Unknown host key<', '>Clave de host desconocida<'],
  ['Runic SSH has never connected to ', 'Runic SSH nunca se ha conectado a '],
  [' before. Confirm the fingerprint through a channel you already trust — not through this connection.',
   '. Confirme la huella digital por un canal en el que ya confíe, no por esta conexión.'],
  ['>KEY TYPE<', '>TIPO DE CLAVE<'],
  ['>SHA256 FINGERPRINT<', '>HUELLA DIGITAL SHA256<'],
  ['>I verified this fingerprint out of band<', '>He verificado esta huella por otro canal<'],
  ['>From the provider console, a configuration repository, or someone who runs the host.<',
   '>En la consola del proveedor, en un repositorio de configuración o con quien administra el host.<'],
  ['>Saved to <span class="mono">known_hosts</span>', '>Se guarda en <span class="mono">known_hosts</span>'],
  ['>Cancel<', '>Cancelar<'],
  ['>Connect once<', '>Conectar una vez<'],
  ['>Trust and connect<', '>Confiar y conectar<'],
];

const hkcPt = [
  ['>Host key changed — connection blocked<', '>Chave de host alterada — conexão bloqueada<'],
  ['The key <span style="color: #ffd8db; font-weight: 600;">stg-db</span> presented does not match the one saved on 14 Mar 2026. Either the host was rebuilt, or something is sitting between you and it.',
   'A chave apresentada por <span style="color: #ffd8db; font-weight: 600;">stg-db</span> não corresponde à salva em 14 de mar de 2026. Ou o host foi reinstalado, ou há algo entre você e ele.'],
  ['>TRUSTED SINCE 14 MAR 2026<', '>CONFIÁVEL DESDE 14 DE MAR DE 2026<'],
  ['>OFFERED NOW · 22 AUG 2026, 09:14<', '>APRESENTADA AGORA · 22 DE AGO DE 2026, 09:14<'],
  ['>TO OVERRIDE, TYPE THE HOST NAME<', '>PARA SUBSTITUIR, DIGITE O NOME DO HOST<'],
  ['>Replace stored key<', '>Substituir chave salva<'],
  ['>Cancel connection<', '>Cancelar conexão<'],
];
const hkcEs = [
  ['>Host key changed — connection blocked<', '>Clave de host cambiada — conexión bloqueada<'],
  ['The key <span style="color: #ffd8db; font-weight: 600;">stg-db</span> presented does not match the one saved on 14 Mar 2026. Either the host was rebuilt, or something is sitting between you and it.',
   'La clave que presentó <span style="color: #ffd8db; font-weight: 600;">stg-db</span> no coincide con la guardada el 14 de mar de 2026. O el host se reinstaló, o hay algo entre usted y él.'],
  ['>TRUSTED SINCE 14 MAR 2026<', '>DE CONFIANZA DESDE EL 14 DE MAR DE 2026<'],
  ['>OFFERED NOW · 22 AUG 2026, 09:14<', '>PRESENTADA AHORA · 22 DE AGO DE 2026, 09:14<'],
  ['>TO OVERRIDE, TYPE THE HOST NAME<', '>PARA REEMPLAZARLA, ESCRIBA EL NOMBRE DEL HOST<'],
  ['>Replace stored key<', '>Reemplazar clave guardada<'],
  ['>Cancel connection<', '>Cancelar conexión<'],
];

make('Main.dc.html', 'MainPtBr.dc.html', mainPt);
make('Main.dc.html', 'MainEs.dc.html', mainEs);
make('HostKey.dc.html', 'HostKeyPtBr.dc.html', hkPt);
make('HostKey.dc.html', 'HostKeyEs.dc.html', hkEs);
make('HostKeyChanged.dc.html', 'HostKeyChangedPtBr.dc.html', hkcPt);
make('HostKeyChanged.dc.html', 'HostKeyChangedEs.dc.html', hkcEs);
