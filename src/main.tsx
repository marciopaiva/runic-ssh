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

/* `?flood=<megabytes>` answers #123 and nothing else: it measures several
   terminals painting at once and posts the result back to the dev server,
   instead of starting the application. It takes no keyboard, which is why that
   issue did not need a person driving a packaged build after all.

   Development only by construction: nothing serves `/__benchmark` in a build,
   and the import is dynamic so the harness never reaches one. */
const flood = new URLSearchParams(window.location.search).get('flood');

if (flood !== null) {
  void (async () => {
    const megabytes = Number(flood) || 32;
    let report: string;

    try {
      const { measureGrid, measurePacedGrid, formatFlood } = await import(
        './features/terminal/flood'
      );
      const flat = await measureGrid(container, megabytes * 1024 * 1024);
      const paced = await measurePacedGrid(container, 10);
      report =
        `FLAT OUT, ${String(megabytes)} MB each\n${formatFlood(flat)}\n\n` +
        `PACED AT THE TRANSPORT RATE, 10 s each\n${formatFlood(paced)}\n\n` +
        JSON.stringify({ flat, paced }, null, 2);
    } catch (error) {
      report = `flood failed: ${String(error)}`;
    }

    await fetch('/__benchmark', { method: 'POST', body: report }).catch(() => undefined);
    document.title = 'flood done';
  })();
} else {
  createRoot(container).render(
    <StrictMode>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </StrictMode>,
  );
}
