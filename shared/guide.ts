import type { Community } from '../src/data/types';
import type { Profile } from '../src/profile/profile';
import { timeFit } from '../src/card/fit';

export interface GuideReply {
  reply: string;
  focusIds: string[];
  openId: string | null;
  suggestions: string[];
  source: 'gemini' | 'offline';
}

const STOP = new Set(['club', 'clubs', 'apu', 'the', 'and', 'of', 'at', 'a', 'an', 'for', 'in', 'to', 'society', 'community', 'association', 'student', 'students']);
const QUERY_STOP = new Set([
  ...STOP, 'i', 'me', 'my', 'want', 'love', 'like', 'how', 'do', 'can', 'join', 'is', 'are', 'there', 'any', 'with', 'some',
  'find', 'show', 'looking', 'look', 'what', 'which', 'something', 'anything', 'new', 'friends', 'make', 'get', 'into',
]);

/** Query phrase -> interest tag (tags come from the catalog's TAG_KEYWORDS). */
const SYNONYMS: [RegExp, string][] = [
  [/\b(photo|photos|photography|photographer|camera|cameras)\b/, 'photo'],
  [/\b(film|films|movie|movies|video|videos|cinema|filmmaking)\b/, 'film'],
  [/\b(music|band|bands|choir|guitar|sing|singing|song|songs)\b/, 'music'],
  [/\b(dance|dancing|cheer|cheerleading)\b/, 'dance'],
  [/\b(code|coding|programming|software|developer|developers|tech|technology|robot|robotics|computer|computers)\b/, 'tech'],
  [/\b(ai|artificial intelligence|machine learning)\b/, 'ai'],
  [/\b(cloud|aws|azure)\b/, 'cloud'],
  [/\b(security|cyber|cybersecurity|hacking|hacker|hackers)\b/, 'security'],
  [/\b(business|entrepreneur|entrepreneurship|marketing|startup|startups)\b/, 'business'],
  [/\b(finance|investing|investment|trading|crypto|blockchain|accounting)\b/, 'finance'],
  [/\b(culture|cultural|heritage|tradition|festival)\b/, 'culture'],
  [/\b(faith|religion|religious|islam|islamic|muslim|christian|buddhist|hindu|church|bible|prayer)\b/, 'faith'],
  [/\b(volunteer|volunteering|charity|sustainability|environment)\b/, 'volunteering'],
  [/\b(football|futsal|sport|sports|basketball|volleyball|cricket|rugby|tennis|swimming|netball|hockey|running|bowling|squash|golf|frisbee|team|fitness)\b/, 'sport-team'],
  [/\b(martial|taekwondo|karate|muay|judo|boxing|silat|fencing|wushu|bjj)\b/, 'martial-arts'],
  [/\b(hiking|hike|climbing|outdoor|outdoors|travel|cycling|camping|adventure|trekking)\b/, 'outdoor'],
  [/\b(game|games|gaming|esports|esport|chess|gamer|gamers)\b/, 'games'],
  [/\b(language|languages|debate|debating|public speaking|english|mandarin|japanese|korean)\b/, 'language'],
  [/\b(leader|leadership|mun|model united nations|council)\b/, 'leadership'],
  [/\b(women|girls|ladies|female)\b/, 'women'],
];

/** Country / nationality words -> fragment of an international community's name. */
const COUNTRIES: [RegExp, string][] = [
  [/\b(africa|african)\b/, 'african'], [/\b(afghanistan|afghan)\b/, 'afghan'],
  [/\b(bangladesh|bangladeshi)\b/, 'bangladesh'], [/\b(egypt|egyptian)\b/, 'egyptian'],
  [/\b(india|indian)\b/, 'indian'], [/\b(indonesia|indonesian)\b/, 'indonesian'],
  [/\b(iran|iranian)\b/, 'iranian'], [/\b(kazakhstan|kazakh)\b/, 'kazakh'],
  [/\b(kenya|kenyan)\b/, 'kenyan'], [/\b(maldives|maldivian)\b/, 'maldivian'],
  [/\b(mauritius|mauritian)\b/, 'mauritian'], [/\b(pakistan|pakistani)\b/, 'pakistani'],
  [/\b(seychelles)\b/, 'seychelles'], [/\b(sri lanka|sri lankan|srilankan)\b/, 'sri lankan'],
  [/\b(sudan|sudanese)\b/, 'sudanese'], [/\b(uzbekistan|uzbek)\b/, 'uzbek'],
  [/\b(yemen|yemeni)\b/, 'yemen'], [/\b(zambia|zambian)\b/, 'zambian'],
  [/\b(djibouti|djiboutian)\b/, 'djiboutian'], [/\b(algeria|algerian|morocco|moroccan)\b/, 'algerian-moroccan'],
  [/\b(somalia|somali)\b/, 'somali'], [/\b(uganda|ugandan)\b/, 'ugandan'],
  [/\b(myanmar|burma|burmese)\b/, 'myanmar'], [/\b(turkmenistan|turkmen)\b/, 'turkmen'],
  [/\b(timor|timor-leste)\b/, 'timor-leste'], [/\b(china|chinese)\b/, 'china'],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const nameCore = (name: string) => words(name.replace(/\([^)]*\)/g, '')).filter((w) => !STOP.has(w));

const SUGGESTIONS = [
  'Which clubs are good for making friends?',
  'Show me sports clubs',
  'What fits my free times?',
  'Any tech or coding communities?',
  'Show international communities',
];

function pickSuggestions(tags: string[], matched: Community[]): string[] {
  const out: string[] = [];
  if (matched[0]) out.push(`Tell me more about ${matched[0].shortName}`);
  if (tags.includes('sport-team')) out.push('Any martial arts clubs?');
  if (tags.includes('tech')) out.push('What about AI or cybersecurity?');
  for (const s of SUGGESTIONS) if (out.length < 3 && !out.includes(s)) out.push(s);
  return out.slice(0, 3);
}

export function localMatch(query: string, catalog: Community[], profile: Profile | null): GuideReply {
  const q = query.toLowerCase();
  const qWords = words(q);
  const qSet = new Set(qWords);
  const qTags = SYNONYMS.filter(([re]) => re.test(q)).map(([, t]) => t);
  const qCountries = COUNTRIES.filter(([re]) => re.test(q)).map(([, f]) => f);
  const terms = qWords.filter((w) => w.length >= 3 && !QUERY_STOP.has(w));
  const interests = new Set(profile?.interests ?? []);

  const scored = catalog.map((c) => {
    const nameL = c.name.toLowerCase();
    const short = c.shortName.toLowerCase();
    const desc = c.description.toLowerCase();
    let score = 0;
    for (const t of qTags) if (c.tags.includes(t)) score += 3;
    for (const f of qCountries) if (nameL.includes(f)) score += 5;
    const core = nameCore(c.name);
    if (core.length && core.every((w) => qSet.has(w))) score += 6;
    for (const t of terms) {
      const re = new RegExp(`\\b${esc(t)}`);
      if (re.test(nameL) || re.test(short)) score += 3;
      else if (re.test(desc)) score += 1;
    }
    // Profile bonuses only rank real matches; they never create one.
    if (score > 0) {
      if (c.tags.some((t) => interests.has(t))) score += 2;
      if (profile && timeFit(c, profile).status === 'fits') score += 1;
    }
    return { c, score };
  });

  const top = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, 4)
    .map((s) => s.c);

  // openId: only when the query contains a community's full name or shortName as a
  // word-bounded phrase ("apu" prefix optional). Longest wins; a tie means ambiguous.
  const qJoined = ' ' + qWords.join(' ') + ' ';
  const stripApu = (w: string[]) => (w[0] === 'apu' ? w.slice(1) : w);
  let open: Community | null = null;
  let openLen = 0;
  let tied = false;
  for (const c of catalog) {
    const phrases = [c.name.replace(/\([^)]*\)/g, ''), c.shortName].map((n) => stripApu(words(n)).join(' ')).filter(Boolean);
    const len = Math.max(0, ...phrases.filter((ph) => qJoined.includes(' ' + ph + ' ')).map((ph) => ph.length));
    if (!len) continue;
    if (len > openLen) { open = c; openLen = len; tied = false; }
    else if (len === openLen && open && open.id !== c.id) tied = true;
  }
  if (tied) open = null;

  const focusIds = top.map((c) => c.id);
  if (open && !focusIds.includes(open.id)) focusIds.unshift(open.id);
  const focus = focusIds.slice(0, 4);
  const names = focus.map((id) => catalog.find((c) => c.id === id)!.shortName);

  let reply: string;
  if (focus.length) {
    const head = focus.length === 1 ? 'Here is 1 community that fits' : `Here are ${focus.length} communities that fit`;
    reply = `${head}. I've lit them up on the map: ${names.join(', ')}.`;
    if (open) reply += " I've opened its card.";
  } else {
    reply = "I couldn't find a match for that. Try the category filters (Societies, Sports, International) to browse everything, or ask about an interest like photography, football or coding.";
  }

  return {
    reply,
    focusIds: focus,
    openId: open ? open.id : null,
    suggestions: pickSuggestions(qTags, top),
    source: 'offline',
  };
}
