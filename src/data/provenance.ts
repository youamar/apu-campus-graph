import { parseMeetingTimes } from './meetingTimes';
import type { CampusEvent, Community } from './types';

/**
 * Provenance: the one place that decides whether a community's value is real or made up.
 * - official: published by Student Affairs (`community.official`) or extracted from the club's own
 *             post (`finePrint.source`); safe to state as fact.
 * - sample:   demo enrichment; must be phrased and shown as an example.
 * - none:     not known (or not from a trusted source); say it is not published yet.
 * Callers (card, agent tools, validator, offline reply) read these labels; they never decide them.
 */
export type Source = 'official' | 'sample' | 'none';

export interface Provenance {
  schedule: Source;
  hours: Source;
  finePrint: Source;
  flags: Source;
  eligibility: Source;
  interested: Source;
  /** The member quote on the card. */
  quote: Source;
}

/** "Upcoming" means starting within the next 7 days (graph stars, tools, card, offline replies). */
export const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The one upcoming rule: starts in [now, now + 7 days). Events are always sample data. */
export function isUpcoming(e: CampusEvent, now: number): boolean {
  const t = Date.parse(e.start);
  return t >= now && t < now + UPCOMING_WINDOW_MS;
}

/** Upcoming events, soonest first. */
export function upcomingEvents(events: CampusEvent[], now: number): CampusEvent[] {
  return events.filter((e) => isUpcoming(e, now)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function provenance(c: Community): Provenance {
  // Only enrichment is sample; a value on a non-sample community without a trusted source is unknown.
  const enriched = (present: unknown): Source => (present ? (c.sample ? 'sample' : 'none') : 'none');
  const fp = c.finePrint;
  const finePrint: Source = !fp ? 'none' : fp.sample ? 'sample' : fp.source ? 'official' : c.sample ? 'sample' : 'none';
  return {
    // Official only when the published text itself gave the slots (else the slots are enrichment).
    schedule: c.official?.meetingTimes && parseMeetingTimes(c.official.meetingTimes).length ? 'official' : enriched(c.schedule?.length),
    hours: enriched(c.hoursPerWeek),
    finePrint,
    flags: enriched(c.beginnerFriendly || c.recruiting),
    eligibility: c.official?.eligibility ? 'official' : 'none',
    interested: enriched(c.interested != null),
    quote: enriched(c.vibeQuote),
  };
}

/** Values the validator must never see stated as fact (sample fees, deadlines, slots). */
export function sampleFinePrintValues(catalog: Community[]): string[] {
  return catalog
    .filter((c) => provenance(c).finePrint === 'sample')
    .flatMap((c) => [c.finePrint?.fee, c.finePrint?.deadline, c.finePrint?.slots])
    .filter((v): v is string => !!v && v.length >= 4);
}

/** Fine-print values read from clubs' own posts: real, so they may be stated without hedging. */
export function officialFinePrintValues(catalog: Community[]): string[] {
  return catalog
    .filter((c) => provenance(c).finePrint === 'official')
    .flatMap((c) => [c.finePrint?.fee, c.finePrint?.deadline, c.finePrint?.slots])
    .filter((v): v is string => !!v && v.length >= 2);
}
