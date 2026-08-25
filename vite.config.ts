import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { benchmarkCollector } from './vite-benchmark-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The dev server port is fixed because `src-tauri/tauri.conf.json` points
// `devUrl` at it. If Vite were allowed to fall back to another port, the shell
// would open on a blank window instead of failing loudly.
const DEV_PORT = 1420;

export default defineConfig({
  plugins: [react(), tailwindcss(), benchmarkCollector()],
  // Tauri serves the built frontend from a file:// origin, so every asset has
  // to be referenced relatively.
  base: './',
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // The Rust side has its own rebuild loop; watching it here would restart
      // the frontend on every `cargo` write.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      // Two documents, two bundles. ADR-0008 says the credential prompt never
      // renders a byte a remote host chose; a separate entry point is what
      // makes that a fact about the build rather than a promise about which
      // component happens to be mounted.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        credential: fileURLToPath(new URL('./credential.html', import.meta.url)),
      },
    },
    // A release build ships no source map: it would hand anyone who opens the
    // bundle a readable map of the IPC surface.
    sourcemap: false,
  },
});
