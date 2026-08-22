import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { benchmarkCollector } from './vite-benchmark-plugin';

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
    // A release build ships no source map: it would hand anyone who opens the
    // bundle a readable map of the IPC surface.
    sourcemap: false,
  },
});
