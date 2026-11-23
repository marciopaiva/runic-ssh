import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import { describeEvent } from '../features/sessions/logbook';
import { useTranslator } from '../features/settings';
import { clearLogbook, readLogbook } from '../ipc';
import type { LogbookEvent } from '../ipc';

import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface LogbookDialogProps {
  /** The host whose Logbook is open, or `null` while closed. */
  readonly host: { readonly id: string; readonly name: string } | null;
  readonly onClose: () => void;
}

/**
 * What happened to one host, newest first (ADR-0081).
 *
 * It is read when it opens and not kept current: a Logbook is for looking back,
 * and a list that moves while it is being read is harder to read. It says what
 * it never holds, because the first thing anyone wants to know about a record
 * of their sessions is what is in it.
 */
export function LogbookDialog({ host, onClose }: LogbookDialogProps): JSX.Element {
  const i18n = useTranslator();
  const [events, setEvents] = useState<readonly LogbookEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const id = host?.id ?? null;
  useEffect(() => {
    setEvents(null);
    setFailed(false);
    setConfirming(false);
    if (id === null) return undefined;
    let current = true;
    readLogbook(id)
      .then((read) => current && setEvents([...read].reverse()))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [id]);

  const clear = (): void => {
    if (id === null) return;
    clearLogbook(id)
      .then(() => {
        setEvents([]);
        setConfirming(false);
      })
      .catch(() => setFailed(true));
  };

  return (
    <Dialog
      open={host !== null}
      onClose={onClose}
      title={host === null ? '' : i18n.t('logbook.title', { name: host.name })}
    >
      <div className="flex flex-col gap-3">
        {failed && (
          <p role="alert" className="text-danger-text text-[12px]">
            {i18n.t('logbook.failed')}
          </p>
        )}
        {events !== null && events.length === 0 && (
          <p className="text-ink-faint text-[12.5px]">{i18n.t('logbook.empty')}</p>
        )}
        {events !== null && events.length > 0 && (
          <ul className="border-line-subtle max-h-72 overflow-y-auto rounded border">
            {events.map((event, index) => {
              const line = describeEvent(event, i18n);
              return (
                <li
                  key={`${event.at}-${index}`}
                  className="border-line-subtle flex items-baseline gap-3 border-b px-3 py-1.5 text-[12px] last:border-b-0"
                >
                  <time dateTime={new Date(event.at).toISOString()} className="text-ink-faint shrink-0 font-mono text-[11px]">
                    {new Date(event.at).toLocaleString()}
                  </time>
                  <span className={`min-w-0 break-all ${line.tone === 'warn' ? 'text-warn' : 'text-ink'}`}>
                    {line.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-ink-faint text-[11px] leading-relaxed">{i18n.t('logbook.never')}</p>
        <div className="flex items-center justify-end gap-2">
          {events !== null && events.length > 0 &&
            (confirming ? (
              <Button type="button" variant="danger" onClick={clear}>
                {i18n.t('logbook.clearConfirm')}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
                {i18n.t('logbook.clear')}
              </Button>
            ))}
          <Button type="button" variant="ghost" onClick={onClose}>
            {i18n.t('logbook.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
