import type { JSX, ReactNode } from 'react';

interface ToolbarProps {
  /** Content specific to one workspace, drawn at the leading edge. Nothing
   * currently occupies this for Sessions or SFTP; the slot exists so a
   * workspace can claim it without a second convention being invented. */
  readonly leading?: ReactNode;
  /** Content specific to one workspace, drawn at the trailing edge:
   * `ShapeControl` for Sessions, the destination split control for SFTP. */
  readonly trailing?: ReactNode;
}

/**
 * The row between the Titlebar and a workspace's rail/sidebar/body.
 *
 * ADR-0046: `SftpSplitControl` was placed inline in the SFTP workspace's
 * body, which repeated the placement ADR-0021 already ruled out for a
 * different control ("a button sitting on one group's strip reads as split
 * this rectangle"). This row is the shared answer instead, present for
 * Sessions and SFTP alike so a workspace's own controls have one place to
 * live rather than each workspace inventing its own.
 *
 * ADR-0052 gives Home this same row, for `ThemeLanguageControls`: a "set
 * once and forget" choice that used to live on a dashboard card `HomeNav`
 * switched to, before Home became one screen with no dashboard to switch
 * away from.
 */
export function Toolbar({ leading, trailing }: ToolbarProps): JSX.Element {
  return (
    <div className="bg-surface-chrome border-line-subtle flex h-[34px] shrink-0 items-center gap-2 border-b px-2">
      {leading}
      <span className="min-w-0 flex-1" />
      {trailing}
    </div>
  );
}
