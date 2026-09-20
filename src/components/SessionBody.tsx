import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import type { ForwardStatus } from '../features/status';
import type { Forward } from '../ipc';

import { MonitorBody } from './map/MonitorBody';
import { SessionFacets } from './SessionFacets';
import type { SessionFacet } from './SessionFacets';
import { TerminalView } from './TerminalView';
import type { TerminalViewProps } from './TerminalView';
import { TunnelsPanel } from './TunnelsPanel';

interface SessionBodyProps extends Omit<TerminalViewProps, 'frame' | 'visible'> {
  /** Whether this session is the active tab of its group, same meaning
      `TerminalView`'s own `visible` prop had before this wrapper existed. */
  readonly visible: boolean;
  /** Where to draw the whole body, facet bar included. ADR-0014: off screen
      it still gets the whole area, so the mounted terminal inside keeps
      measuring something real. */
  readonly frame: CSSProperties;
  readonly forwards: readonly ForwardStatus[];
  readonly adHocForwards: readonly ForwardStatus[];
  readonly onAddAdHocForward: (forward: Forward) => void;
  readonly onRemoveAdHocForward: (index: number) => void;
  readonly onEditHost: () => void;
}

const CONTENT_FRAME: CSSProperties = { position: 'absolute', inset: 0 };

/**
 * A session's own body: the facet bar (`SessionFacets`) above, and below it
 * either the terminal or the Tunnels panel.
 *
 * Sits exactly where `TerminalView` alone used to sit in the sibling list at
 * the top of the tree (ADR-0014), so moving a session between groups still
 * never remounts it. DOM order there follows tab order, not which session is
 * on screen, so a session sitting behind another can still land after it in
 * that list and paint over it; this root uses the same `visibility` technique
 * `TerminalView` used for that case, so a hidden session's facet bar and
 * `frame=WHOLE_AREA` fallback (ADR-0014) never draw over whatever is showing.
 * The terminal stays mounted under both facets inside it; the tab switch
 * changes which one is visible with that same technique, on a second axis.
 */
export function SessionBody({
  visible,
  frame,
  forwards,
  adHocForwards,
  onAddAdHocForward,
  onRemoveAdHocForward,
  onEditHost,
  ...terminal
}: SessionBodyProps): JSX.Element {
  const [facet, setFacet] = useState<SessionFacet>('terminal');

  return (
    <div
      className={`absolute flex flex-col overflow-hidden ${visible ? '' : 'invisible pointer-events-none'}`}
      style={frame}
      aria-hidden={visible ? undefined : true}
    >
      <SessionFacets active={facet} tunnelCount={forwards.length + adHocForwards.length} onChange={setFacet} />
      <div className="relative min-h-0 flex-1">
        <TerminalView {...terminal} visible={visible && facet === 'terminal'} frame={CONTENT_FRAME} />
        {visible && facet === 'tunnels' && (
          <TunnelsPanel
            forwards={forwards}
            adHocForwards={adHocForwards}
            onAddForward={onAddAdHocForward}
            onRemoveForward={onRemoveAdHocForward}
            onEditHost={onEditHost}
          />
        )}
        {/* Mounted only while this facet is the one showing, so the polling
            `MonitorBody` starts (ADR-0072) stops the moment the tab flips
            away or the pane itself goes invisible, same teardown the
            standalone Monitor workspace already relied on `useSystemStats`
            for (CLAUDE.md section 6). */}
        {visible && facet === 'monitor' && terminal.handle !== null && terminal.session !== null && (
          <div className="absolute inset-0">
            <MonitorBody session={terminal.session} handle={terminal.handle} />
          </div>
        )}
      </div>
    </div>
  );
}
