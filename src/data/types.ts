export type CategoryKey = 'soc' | 'spo' | 'intl';

export interface FinePrint {
  fee?: string;
  register?: string;
  booking?: string;
  slots?: string;
  deadline?: string;
  source?: string;
  extractedAt?: string;
  /** Who read it from the club's post: Gemini or the offline text reader. */
  by?: 'gemini' | 'offline';
  sample?: boolean;
}

export interface Slot {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  start: string; // HH:MM
  end: string;
}

export interface Community {
  id: string;
  name: string;
  shortName: string;
  category: CategoryKey;
  description: string;
  email?: string;
  instagram?: string;
  moreInfoUrl?: string;
  joinUrl?: string;
  /** Student Affairs page that lists this community. */
  subpageUrl?: string;
  logoUrl?: string;
  activity: number; // 1-5
  tags: string[];
  eligibility: { openToAll: boolean; note?: string };
  beginnerFriendly?: boolean;
  recruiting?: boolean;
  hoursPerWeek?: string;
  schedule?: Slot[];
  vibeQuote?: string;
  interested?: number;
  finePrint?: FinePrint;
  /** Verbatim text published by Student Affairs (real, never sample). */
  official?: { meetingTimes?: string; eligibility?: string };
  sample: boolean;
}

export interface CampusEvent {
  id: string;
  communityId: string;
  title: string;
  place: string;
  start: string; // ISO
  going: number;
  sample: true;
}

export interface RawClub {
  name: string;
  group: string;
  description: string | null;
  president?: string | null;
  advisors?: string | null;
  email: string | null;
  social: string | null;
  more_info_url: string | null;
  logo_url: string | null;
  join_url: string | null;
  subpage_url?: string | null;
  fees?: string | null;
  meeting_times?: string | null;
  eligibility?: string | null;
}

export interface RawEvent {
  id: string;
  communityId: string;
  title: string;
  place: string;
  dayOffset: number; // 0 = today
  time: string; // HH:MM
  going: number;
}

export interface Enrichment {
  communities: Record<string, Partial<Community> & { finePrint?: FinePrint }>;
  events: RawEvent[];
}
