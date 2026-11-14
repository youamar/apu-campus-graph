import type { Community, FinePrint } from './types';

/**
 * Fine print read from a club's own post (poster reader). Kept on this device and sent with each chat
 * request, so the card and the guide both use it. Provenance treats it as real (finePrint.source set).
 */
export type Extracted = Record<string, FinePrint>;

export const EXTRACTED_KEY = 'apu-campus-graph/extracted';
const FIELDS = ['fee', 'register', 'booking', 'slots', 'deadline', 'source', 'extractedAt'] as const;
const MAX_ENTRIES = 30;
const FIELD_MAX = 200;

/** Rebuilds extracted fine print from untrusted input (storage or a request body); drops anything malformed. */
export function sanitizeExtracted(v: unknown, validIds: Set<string>): Extracted {
  const out: Extracted = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, fp] of Object.entries(v as Record<string, unknown>).slice(0, MAX_ENTRIES)) {
    if (!validIds.has(id) || !fp || typeof fp !== 'object') continue;
    const clean: FinePrint = { sample: false };
    for (const k of FIELDS) {
      const s = (fp as Record<string, unknown>)[k];
      if (typeof s === 'string' && s.trim()) clean[k] = s.trim().slice(0, FIELD_MAX);
    }
    const by = (fp as Record<string, unknown>).by;
    if (by === 'gemini' || by === 'offline') clean.by = by;
    if (clean.source && (clean.fee || clean.register || clean.booking || clean.slots || clean.deadline)) out[id] = clean;
  }
  return out;
}

/** The catalog with extracted fine print replacing (sample) fine print for those communities. */
export function applyExtracted(catalog: Community[], extracted: Extracted): Community[] {
  if (!Object.keys(extracted).length) return catalog;
  return catalog.map((c) => (extracted[c.id] ? { ...c, finePrint: extracted[c.id] } : c));
}

export function loadExtracted(validIds: Set<string>): Extracted {
  try {
    return sanitizeExtracted(JSON.parse(localStorage.getItem(EXTRACTED_KEY) ?? '{}'), validIds);
  } catch {
    return {};
  }
}

export function saveExtracted(e: Extracted): void {
  try {
    localStorage.setItem(EXTRACTED_KEY, JSON.stringify(e));
  } catch {
    /* storage unavailable: keep it for this session only */
  }
}
