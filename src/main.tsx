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

/* The palette was composed in dark. Tokens.css already swaps for a light OS
   preference, which is correct for a shipped preference — but until Settings
   offers an appearance control, that swap hides the designed surfaces from
   anyone whose desktop is light. Pin dark so the mockup direction is what
   runs on this branch. */
document.documentElement.setAttribute('data-theme', 'dark');

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
