import { useEffect, useState } from 'react';
import type { CampusEvent } from '../data/types';

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The next event today that has not started yet, or null. */
export function nextEventToday(events: CampusEvent[], now: Date): CampusEvent | null {
  const upcoming = events
    .filter((e) => {
      const d = new Date(e.start);
      return sameLocalDay(d, now) && d.getTime() > now.getTime();
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0] ?? null;
}

export function startsIn(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export default function LiveTicker({
  events,
  onSelect,
}: {
  events: CampusEvent[];
  onSelect?(communityId: string): void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ev = nextEventToday(events, now);
  if (!ev) {
    return (
      <div className="cg-pill cg-ticker">
        <span className="cg-live-dot idle" />
        <span className="cg-muted">No more events today. Check back tomorrow.</span>
      </div>
    );
  }
  return (
    <button type="button" className="cg-pill cg-ticker" onClick={() => onSelect?.(ev.communityId)}>
      <span className="cg-live-dot" />
      <span className="cg-live">LIVE</span>
      <strong>
        {ev.title} starts in {startsIn(new Date(ev.start).getTime() - now.getTime())}
      </strong>
      <span className="cg-muted">· {ev.going} going</span>
    </button>
  );
}
