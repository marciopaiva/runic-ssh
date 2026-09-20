import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import { paletteKeys } from '../features/status';
import type { CommandModifier } from '../ipc';
import { LogoMark } from './LogoMark';
import { Button } from './ui/Button';
import { PlusIcon } from './ui/icons';

interface EmptyPanelPanelProps {
  readonly modifier: CommandModifier;
  readonly variant?: 'panel';
  /**
   * Overrides Sessions' own copy, for a caller with a different "nothing is
   * open" of its own. Home's empty host list is the one that gives these:
   * its hint ("pick a host on the left") has nothing to do with `modifier`'s
   * shortcut, so a caller that gives one gives the other.
   */
  readonly title?: string;
  readonly body?: string;
  /**
   * Opens the host palette targeting this panel, same as the group variant's
   * button. Optional because Home's empty host list has its own "pick a host
   * on the left" hint and no rectangle of its own to target.
   */
  readonly onOpenHost?: () => void;
}

interface EmptyPanelGroupProps {
  readonly modifier: CommandModifier;
  readonly variant: 'group';
  /**
   * Overrides Sessions' own copy, for a caller with a different "nothing is
   * open" of its own. SFTP's source and destination slots are the callers
   * that give one; the action button below is the same for all of them.
   */
  readonly title?: string;
  /** Opens the host palette targeting whichever rectangle or slot this is. */
  readonly onOpenHost: () => void;
}

type EmptyPanelProps = EmptyPanelPanelProps | EmptyPanelGroupProps;

/**
 * The main area with nothing open in it.
 *
 * A blank panel and a blank status bar is indistinguishable from a window that
 * failed to paint, which is the first thing a new user meets. This says which
 * of the two it is. `panel` is a window with no session at all; `group` is one
 * rectangle of a division with sessions running in the others, where saying
 * "no session open" would be plainly false. Both get the same "Open host"
 * button when the caller gives one a rectangle or slot to target, rather than
 * a hint pointing elsewhere at it; `panel`'s `onOpenHost` is optional only for
 * a caller like Home's empty host list, which has its own hint and no
 * rectangle of its own to open a host into.
 */
export function EmptyPanel(props: EmptyPanelProps): JSX.Element {
  const i18n = useTranslator();
  const { modifier } = props;
  /* The same helper the status bar uses, so the shortcut is never spelled two
     ways in one window and so a Mac reads ⌘ in both places. */
  const keys = paletteKeys(modifier).join(' ');
  /* `body` doesn't exist on the group variant at all, and `onOpenHost` is
     required there instead of optional; narrowing through `props.variant`
     here, once, keeps that out of the render below. */
  const onOpenHost = props.variant === 'group' ? props.onOpenHost : props.onOpenHost;
  const body = props.variant === 'group' ? undefined : props.body;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 p-8">
      {props.variant === 'group' ? (
        <LogoMark className="h-[46px] w-[46px] opacity-50" />
      ) : (
        <div className="flex items-center gap-3.5" aria-hidden="true">
          <LogoMark className="h-16 w-16" />
          <span className="text-ink text-[27px] font-extrabold tracking-tight">{i18n.t('app.name')}</span>
        </div>
      )}

      <div className="flex flex-col items-center gap-[11px]">
        <span className="text-ink-secondary text-[14px] font-semibold">
          {props.title ?? i18n.t(props.variant === 'group' ? 'empty.group.title' : 'empty.title')}
        </span>
        {onOpenHost ? (
          <Button variant="primary" size="sm" leftIcon={<PlusIcon className="h-3 w-3" />} onClick={onOpenHost}>
            {i18n.t('empty.action')}
          </Button>
        ) : (
          <span className="text-ink-faint text-[12.5px]">{body ?? i18n.t('empty.hint', { keys })}</span>
        )}
      </div>
    </div>
  );
}
