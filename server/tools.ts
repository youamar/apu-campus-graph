import type { CampusEvent, Community } from "../src/data/types";
import type { Profile } from "../src/profile/profile";
import { clubFacts, type ClubFacts } from "../src/card/facts";
import { timeFit } from "../src/card/fit";
import { upcomingEvents } from "../src/data/provenance";
import { rankClubs, relatedClubs } from "../shared/guide";
import type { ToolCall } from "./step";

/**
 * The guide's tools. Gemini decides which to call (function calling); the server runs them over the
 * real catalog and returns the results, so every fact the guide states can come from a tool result.
 * The UI actions (focus the map, open a card) are the structured fields of the final answer.
 */

export const TOOL_DECLARATIONS = [
  {
    name: "search_clubs",
    description:
      "Search all 137 APU communities by interest, activity, name or country. Returns the best matches (the top 3 with full details, same as get_club) plus related communities (adjacent interests). Call this first for any discovery question.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description:
            'Keywords, e.g. "photography film camera" or "football".',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_club",
    description:
      "Full details for one community id: description, how to join, eligibility, schedule, fine print, events in the next 7 days and whether it fits this student's free times. Values marked sample are examples.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: {
          type: "STRING",
          description: "A community id from search_clubs or the CATALOG.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "upcoming_events",
    description:
      'Events in the next 7 days (all sample examples), soonest first. Use for "what is happening this week?".',
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "add_to_week",
    description:
      "Add 1-3 communities to the student's week (their personal plan). Only communities whose schedule fits the student's free times are added; the result lists added and rejected ids with reasons. Prefer communities whose timetable fit is based on published times. Call it when the student asks to plan their week, add or sign up for clubs that fit their time.",
    parameters: {
      type: "OBJECT",
      properties: { ids: { type: "ARRAY", items: { type: "STRING" }, description: "1-3 community ids, best first." } },
      required: ["ids"],
    },
  },
] as const;

/** add_to_week adds at most this many communities per call. */
export const MAX_WEEK_ADDS = 3;

export interface ToolContext {
  catalog: Community[];
  events: CampusEvent[];
  profile: Profile | null;
  now?: Date;
}

/** search_clubs returns full details for this many top matches. */
export const SEARCH_DETAILS = 3;

const brief = (c: Community) => ({
  id: c.id,
  name: c.shortName,
  category: c.category,
  tags: c.tags,
});

export function runTool(
  call: ToolCall,
  ctx: ToolContext,
): Record<string, unknown> {
  const { catalog, events, profile } = ctx;
  const now = (ctx.now ?? new Date()).getTime();
  if (call.name === "search_clubs") {
    const query =
      typeof call.args.query === "string" ? call.args.query.slice(0, 200) : "";
    const matches = rankClubs(query, catalog, profile)
      .slice(0, 6)
      .map((s) => s.c);
    const related = matches.length
      ? relatedClubs(matches.slice(0, 2), catalog, 4)
      : [];
    // The top matches come with full details, so most questions need no get_club round trip.
    const details = [...matches, ...related].slice(0, SEARCH_DETAILS).map((c) => serialiseFacts(clubFacts(c, profile, events, now)));
    return {
      matches: matches.map(brief),
      details,
      related: related.map(brief),
      note: matches.length ? undefined : "No direct match.",
    };
  }
  if (call.name === "get_club") {
    const c = catalog.find((x) => x.id === call.args.id);
    if (!c) return { error: `Unknown id "${String(call.args.id)}". Use search_clubs to find real ids.` };
    return serialiseFacts(clubFacts(c, profile, events, now));
  }
  if (call.name === "upcoming_events") {
    const list = upcomingEvents(events, now)
      .slice(0, 10)
      .map((e) => ({ communityId: e.communityId, title: e.title, place: e.place, start: e.start, sample: true }));
    return { note: "All events are sample examples: say 'for example' or '(sample event)'.", events: list };
  }
  if (call.name === "add_to_week") {
    // An action: the server checks every id against the student's free times before it counts.
    if (!profile?.free.length)
      return { error: "The student has not set their free times. Add nothing; ask them to set free times in their profile first." };
    const ids = Array.isArray(call.args.ids)
      ? [...new Set(call.args.ids.filter((x): x is string => typeof x === "string"))].slice(0, MAX_WEEK_ADDS)
      : [];
    const added: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const basedOnSample: string[] = [];
    for (const id of ids) {
      const c = catalog.find((x) => x.id === id);
      if (!c) {
        rejected.push({ id, reason: "unknown id" });
        continue;
      }
      const fit = timeFit(c, profile);
      if (fit.status === "fits") {
        added.push(id);
        if (fit.source !== "official") basedOnSample.push(id);
      } else rejected.push({ id, reason: fit.reason });
    }
    return {
      added,
      rejected,
      ...(basedOnSample.length ? { basedOnSampleSchedule: basedOnSample } : {}),
      note: "Only say a community was added if it is listed in added. Say why the others were not. For ids in basedOnSampleSchedule, say the fit is based on a sample schedule.",
    };
  }
  return { error: `Unknown tool "${call.name}".` };
}

/** Human-readable trace line for the UI ("Searched clubs: photography"). */
export function traceLine(call: ToolCall, catalog: Community[]): string {
  if (call.name === "search_clubs")
    return `Searched clubs: "${String(call.args.query ?? "").slice(0, 40)}"`;
  if (call.name === "get_club") {
    const c = catalog.find((x) => x.id === call.args.id);
    return c ? `Read ${c.shortName}` : "Looked up an unknown id (rejected)";
  }
  if (call.name === "upcoming_events") return "Checked this week's events";
  return `Called ${call.name}`;
}


/**
 * get_club's view of ClubFacts: values are grouped by Provenance, so the model sees at a glance
 * what it may state as fact (official*), what must be hedged (sampleExamples) and what is unknown.
 */
export function serialiseFacts(f: ClubFacts): Record<string, unknown> {
  const { community: c, provenance: p, fit } = f;
  const sample: Record<string, unknown> = {};
  if (p.schedule === "sample") sample.schedule = c.schedule;
  if (p.hours === "sample") sample.hoursPerWeek = c.hoursPerWeek;
  if (p.finePrint === "sample") sample.finePrint = c.finePrint;
  if (p.flags === "sample") Object.assign(sample, { beginnerFriendly: c.beginnerFriendly, recruiting: c.recruiting });
  const unknown = [
    p.schedule === "none" && "meeting times",
    p.finePrint === "none" && "fee and deadline",
  ].filter(Boolean);
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    officialChannel: f.channel.href,
    ...(c.instagram ? { instagram: c.instagram } : {}),
    canJoin: f.join.reason,
    ...(p.schedule === "official" ? { officialMeetingTimes: c.official?.meetingTimes } : {}),
    ...(p.eligibility === "official" ? { officialEligibility: c.official?.eligibility } : {}),
    ...(p.finePrint === "official"
      ? { officialFinePrint: { ...c.finePrint, note: `Real: read from the club's own post (${c.finePrint?.source ?? "a club post"}). State it plainly.` } }
      : {}),
    timetable:
      fit.status === "unknown"
        ? fit.reason
        : `${fit.status}: ${fit.reason} (${fit.source === "official" ? "published times" : "based on a sample schedule"})`,
    ...(Object.keys(sample).length
      ? { sampleExamples: { note: 'Made-up demo values. Phrase every one as an example ("for example ... (sample data)").', ...sample } }
      : {}),
    ...(unknown.length ? { notPublished: `${unknown.join(", ")}: not published. Say so; do not guess.` } : {}),
    upcomingEvents: f.upcoming.map((e) => ({ title: e.title, place: e.place, start: e.start, sample: true })),
    ...(f.upcoming.length ? { eventsNote: "Every event is a sample example: say 'for example' or '(sample event)'." } : {}),
  };
}
