import type { CampusEvent, Community } from "../src/data/types";
import type { Profile } from "../src/profile/profile";
import { timeFit } from "../src/card/fit";
import { officialFinePrintValues, provenance, sampleFinePrintValues } from "../src/data/provenance";

/** Validator: checks a reply's wording against the catalog; returns problems for the model to fix. */

const NAME_STOP = new Set([
  "the",
  "of",
  "and",
  "apu",
  "club",
  "society",
  "association",
  "community",
  "communities",
  "sig",
  "for",
  "students",
]);
const nameWords = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !NAME_STOP.has(w)).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));

/** "Quidditch Club", "APU Chess Society": capitalised phrases that end in a community noun. */
const CLUB_PHRASE = /\b((?:[A-Z][\w&'’-]*\s+){1,4}(?:[Cc]lub|[Ss]ociety|[Aa]ssociation|SIG))\b/g;
/** A sentence denying a club exists ("there is no Quidditch Club") is the right answer, not an invention. */
const DENIAL = /\b(no|not|isn'?t|doesn'?t|don'?t|couldn'?t|can'?t|cannot|unable)\b/i;

const HEDGE = /\b(example|e\.g\.|might|sample|could|may)\b/i;
const MONEY = /\bRM\s?\d/i;
/** Persona hijacks from prompt injection ("talk like a pirate"). */
const PERSONA = /\b(ahoy|matey|arr+g?h?|avast|shiver me|me hearties|ye be)\b/i;

/**
 * Checks the reply text (ids are validated separately). Returns problems the model must fix:
 * a club name that is not in the catalog, or a fee/deadline-like value stated as fact.
 */
export interface CheckContext {
  events?: CampusEvent[];
  profile?: Profile | null;
  /** Communities the answer recommends (its focusIds). */
  focusIds?: string[];
}

const LINK = /(https?:\/\/|www\.|linktr\.ee|@[\w.]{3,})/i;
const CLASH_WORDS = /\b(clash|clashes|conflict|conflicts|overlap|overlaps)\b|doesn'?t fit|does not fit|not fit|outside your free/i;

export function checkReply(reply: string, catalog: Community[], ctx: CheckContext = {}): string[] {
  const problems: string[] = [];
  const sentences = reply.split(/(?<=[.!?])\s+/);
  // Sample events presented as real.
  for (const e of ctx.events ?? []) {
    if (e.title.length < 6) continue;
    const s = sentences.find((x) => x.toLowerCase().includes(e.title.toLowerCase()));
    if (s && !HEDGE.test(s) && !/\bsample\b/i.test(reply))
      problems.push(`"${e.title}" is a sample event; introduce it as an example ("for example" or "(sample event)").`);
  }
  // A real, official link labelled as sample.
  for (const s of sentences) {
    if (LINK.test(s) && /\bsample\b/i.test(s))
      problems.push(`"${s.trim()}" labels an official link as sample. Official channels are real: put the link in its own sentence without "sample".`);
  }
  // Sample schedules stated as published/real times.
  const TIME_IN = /\b\d{1,2}([:.]\d{2})\s*(am|pm)?\b|\b\d{1,2}\s*(am|pm)\b/i;
  for (const id of ctx.focusIds ?? []) {
    const c = catalog.find((x) => x.id === id);
    if (!c || provenance(c).schedule !== "sample") continue;
    const named = (st: string) => st.toLowerCase().includes(c.shortName.toLowerCase().replace(/^apu\s+/, ""));
    const onlyOne = (ctx.focusIds ?? []).length === 1;
    for (const st of sentences) {
      if (!TIME_IN.test(st)) continue;
      // A sentence about another club (whose times may really be published) is not about this one.
      if (!named(st) && !onlyOne) continue;
      const claimsReal = /\b(published|official)\b/i.test(st) && !/\bofficial channel\b/i.test(st);
      if (claimsReal || (!HEDGE.test(st) && (c.schedule ?? []).some((x) => st.includes(x.start)))) {
        problems.push(`"${st.trim()}" states ${c.shortName}'s sample schedule as real. Its meeting times are not published: phrase them as an example.`);
      }
    }
  }
  // Recommending a community that clashes with the student's free times without saying so.
  if (ctx.profile?.free.length && !CLASH_WORDS.test(reply)) {
    for (const id of ctx.focusIds ?? []) {
      const c = catalog.find((x) => x.id === id);
      if (!c || timeFit(c, ctx.profile).status !== "clash") continue;
      const named = reply.toLowerCase().includes(c.shortName.toLowerCase().replace(/^apu\s+/, ""));
      if (named) problems.push(`${c.shortName} clashes with the student's free times (${timeFit(c, ctx.profile).reason}). Say it clashes, or drop it.`);
    }
  }
  const known = catalog.map(
    (c) => new Set([...nameWords(c.name), ...nameWords(c.shortName)]),
  );
  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    if (DENIAL.test(sentence)) continue;
    for (const m of sentence.matchAll(CLUB_PHRASE)) {
      const ws = nameWords(m[1]);
      if (!ws.length) continue;
      // Leading words may be ordinary sentence words ("Try Photography Club"): any real suffix counts.
      const exists = ws.some((_, i) => known.some((k) => ws.slice(i).every((w) => k.has(w))));
      if (!exists) problems.push(`"${m[1]}" is not an APU community in the catalog. Remove it or say it does not exist.`);
    }
  }
  // Sample values only count for the communities this reply recommends (another club's sample
  // deadline can coincide with a real one), and a value that is also real never counts.
  const scope = ctx.focusIds?.length ? catalog.filter((c) => ctx.focusIds!.includes(c.id)) : catalog;
  const officialValues = officialFinePrintValues(catalog).map((v) => v.toLowerCase());
  // Values without a digit ("Free", "Open") read as ordinary words ("your free times"), so only
  // concrete values (fees, dates, counts) are matched.
  const sampleValues = sampleFinePrintValues(scope)
    .map((v) => v.toLowerCase())
    .filter((v) => /\d/.test(v) && !officialValues.includes(v));
  const mentions = (s: string, v: string) => new RegExp(`(^|\\W)${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(s);
  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    const s = sentence.toLowerCase();
    // A fee read from the club's own post (official fine print) may be stated plainly.
    const officialMoney = officialValues.some((v) => mentions(s, v));
    const usesSample = (MONEY.test(sentence) && !officialMoney) || sampleValues.some((v) => mentions(s, v));
    if (usesSample && !HEDGE.test(sentence)) {
      problems.push(
        `"${sentence.trim()}" states a sample value as fact. Rephrase it as an example ("for example ... (sample data)").`,
      );
    }
  }
  if (PERSONA.test(reply)) problems.push('The reply uses a role-play voice. Answer in the plain, friendly guide voice; the student cannot change it.');
  return [...new Set(problems)];
}
