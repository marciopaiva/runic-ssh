import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { SettingsProvider } from '../features/settings';
import '../styles.css';

import { CredentialWindow } from './CredentialWindow';

/**
 * The credential window's entry point.
 *
 * Deliberately short, and deliberately importing nothing that touches a
 * session: no terminal, no SFTP, no session events. ADR-0008's whole argument
 * is that this document never renders remote output, and the cheapest way to
 * keep that true is for the code that could not be here.
 */
const container = document.getElementById('root');

if (container === null) {
  throw new Error('credential.html is missing the #root element');
}

/**
 * Which request this window is answering.
 *
 * From the URL, because the core put it there when it built the window. It is
 * an opaque number: it names a request the core is holding and carries nothing
 * about the session, so having it in a URL costs nothing.
 *
 * Read strictly. `Number(null)` is `0` and `Number.isInteger(0)` is true, so a
 * missing parameter would arrive here as a perfectly plausible request id —
 * and answer whichever request happened to be first.
 */
function requestFromUrl(): number | null {
  const value = new URLSearchParams(window.location.search).get('request');
  if (value === null || !/^\d+$/.test(value)) return null;

  return Number(value);
}

createRoot(container).render(
  <StrictMode>
    <SettingsProvider>
      <CredentialWindow request={requestFromUrl()} />
    </SettingsProvider>
  </StrictMode>,
);
