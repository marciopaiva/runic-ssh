// Inline the application's own xterm build into the spike page, so the page
// measures the exact version that ships. Run from the repository root:
//   node docs/measurements/terminal-under-zoom/build.mjs
// and open docs/measurements/terminal-under-zoom/xterm-under-zoom.html.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const page = readFileSync(here + 'page.html', 'utf8');
const css = readFileSync('node_modules/@xterm/xterm/css/xterm.css', 'utf8');
const js = readFileSync('node_modules/@xterm/xterm/lib/xterm.js', 'utf8');
const fit = readFileSync('node_modules/@xterm/addon-fit/lib/addon-fit.js', 'utf8');
const guard = (s) => s.replaceAll('</script>', '<\\/script>');
writeFileSync(
  here + 'xterm-under-zoom.html',
  page.replace('/*XTERM_CSS*/', css).replace('/*XTERM_JS*/', guard(js)).replace('/*FIT_JS*/', guard(fit)),
);
console.log('wrote xterm-under-zoom.html');
