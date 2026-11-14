import type { CampusEvent, Community } from '../data/types';
import type { Profile } from '../profile/profile';
import { provenance, upcomingEvents, type Provenance } from '../data/provenance';
import { canJoin, joinHref, joinLabel, timeFit, type FitCheck, type JoinCheck } from './fit';

/**
 * ClubFacts: everything one student needs to know about one community, with provenance attached.
 * The detail card renders it; the guide's get_club tool serialises it. One read, two views.
 */
export interface ClubFacts {
  community: Community;
  join: JoinCheck;
  /** Timetable fit for this student, with the source of the schedule it rests on. */
  fit: FitCheck;
  /** Safe official channel (joinHref already rejects unsafe URLs) and its button label. */
  channel: { href: string; label: string };
  upcoming: CampusEvent[];
  provenance: Provenance;
}

export function clubFacts(c: Community, profile: Profile | null, events: CampusEvent[], now: number = Date.now()): ClubFacts {
  return {
    community: c,
    join: canJoin(c, profile),
    fit: timeFit(c, profile),
    channel: { href: joinHref(c), label: joinLabel(c) },
    upcoming: upcomingEvents(events.filter((e) => e.communityId === c.id), now),
    provenance: provenance(c),
  };
}
