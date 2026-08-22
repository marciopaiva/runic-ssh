import type { Plugin } from 'vite';

/**
 * Collects a renderer measurement taken by a browser that has a GPU.
 *
 * The problem this solves is that the machine running the tooling and the
 * machine with the graphics card are not always the same one — under WSL they
 * never are. The page runs where the GPU is, and posts its result back to the
 * dev server, which prints it here.
 *
 * Development only by construction: a Vite plugin's `configureServer` has no
 * counterpart in a build.
 */
export function benchmarkCollector(): Plugin {
  return {
    name: 'runic-benchmark-collector',
    configureServer(server) {
      server.middlewares.use('/__benchmark', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end();
          return;
        }

        let body = '';
        request.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
          /* A measurement is a few hundred bytes. Anything larger is not one. */
          if (body.length > 64 * 1024) request.destroy();
        });

        request.on('end', () => {
          server.config.logger.info(`\n─── renderer measurement ───\n${body}\n`);
          response.statusCode = 204;
          response.end();
        });
      });
    },
  };
}
