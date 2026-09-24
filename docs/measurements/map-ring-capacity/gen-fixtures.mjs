/**
 * Writes a synthetic sessions.json and workspace.json that seat `total`
 * items, split roughly a quarter layers, a quarter visions and half free
 * components (ADR-0068's own "many layers and many loose components"),
 * none of them given a `position`, so the map's own ring/honeycomb placement
 * picks where every one of them lands.
 *
 * Usage: node gen-fixtures.mjs <total> <out-dir>
 * <out-dir> is a directory to be used as XDG_CONFIG_HOME/com.runicssh.client
 * (or the platform equivalent) when launching the app.
 */
import { writeFileSync } from 'node:fs';

function mix(total) {
  const layers = Math.round(total * 0.25);
  const visions = Math.round(total * 0.25);
  const components = total - layers - visions;
  return { layers, visions, components };
}

const total = Number(process.argv[2]);
const outDir = process.argv[3];
if (!Number.isFinite(total) || !outDir) {
  console.error('usage: node gen-fixtures.mjs <total> <out-dir>');
  process.exit(1);
}
const { layers, visions, components } = mix(total);

const sessions = Array.from({ length: components }, (_, i) => ({
  id: `spike-s${i}`,
  name: `spike-host-${i}`,
  host: `10.99.0.${i + 1}`,
  port: 22,
  user: 'spike',
}));

const workspace = {
  components: Array.from({ length: components }, (_, i) => ({
    id: `spike-c${i}`,
    kind: 'ssh',
    host: `spike-s${i}`,
  })),
  links: [],
  visions: Array.from({ length: visions }, (_, i) => ({
    id: `spike-v${i}`,
    name: `Vision ${i}`,
    components: [],
    open: false,
  })),
  layers: Array.from({ length: layers }, (_, i) => ({
    id: `spike-layer-${i}`,
    name: `Layer ${i}`,
  })),
};

writeFileSync(`${outDir}/sessions.json`, JSON.stringify(sessions, null, 2));
writeFileSync(`${outDir}/workspace.json`, JSON.stringify(workspace, null, 2));
writeFileSync(`${outDir}/settings.json`, JSON.stringify({ previewFeatures: true, nativeDecorations: false, theme: 'dark' }, null, 2));
console.log(`total=${total} layers=${layers} visions=${visions} components=${components}`);
