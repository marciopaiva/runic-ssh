import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { LocaleProvider } from './features/settings';
import './styles.css';

const container = document.getElementById('root');

// Failing loudly beats mounting nothing and leaving a blank window that looks
// like the shell never started.
if (container === null) {
  throw new Error('index.html is missing the #root element');
}

/* Development only. The renderer comparison is meant to be run by hand on a
   machine with a GPU (issue #67), and `import.meta.env.DEV` keeps it out of a
   release build entirely rather than relying on nobody finding it.

   Registered here so running it is one line in the console instead of a
   dynamic import against a path that changes whenever the tree does. */
if (import.meta.env.DEV) {
  void import('./features/terminal').then(({ compareRenderers, formatComparison }) => {
    Object.assign(window, {
      runicBenchmarkRenderers: async (megabytes = 32): Promise<string> => {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.inset = '0';
        host.style.zIndex = '9999';
        document.body.append(host);

        try {
          return formatComparison(await compareRenderers(host, megabytes * 1024 * 1024));
        } finally {
          host.remove();
        }
      },
    });

    // eslint-disable-next-line no-console
    console.info(
      'Renderer benchmark available: await runicBenchmarkRenderers()\n' +
        'Needs a working GPU — see docs/measurements/terminal-throughput.md',
    );
  });
}

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
