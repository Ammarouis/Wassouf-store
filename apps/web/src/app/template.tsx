import type { ReactNode } from 'react';

/**
 * Re-mounts on every route change, which replays the `.page-enter`
 * animation in globals.css. The header, footer and mobile nav live in the
 * layout above this file, so they stay put while only the page body fades in.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}