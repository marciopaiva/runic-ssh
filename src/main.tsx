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

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
