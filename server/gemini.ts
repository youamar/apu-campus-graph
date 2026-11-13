import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type { Generate } from './chat';

/**
 * Checked against this key's models.list on 2026-11-13: gemini-2.5-flash is listed but returns 404
 * ("no longer available to new users"); gemini-3.8-flash / 3.7-flash / 3.5-flash returned 503 (high demand);
 * gemini-3.5-flash-lite answered in ~2s. Override with GEMINI_MODEL.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Structured output contract; parseGuideResponse re-validates every field against the catalog. */
export const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: 'Friendly answer, under 90 words, in the user language.' },
    focusIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '0-6 community ids copied exactly from the CATALOG, best first.',
    },
    openId: {
      type: Type.STRING,
      nullable: true,
      description: 'One community id when the user asks about one specific community, otherwise null.',
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exactly 3 short follow-up questions.',
    },
  },
  required: ['reply', 'focusIds', 'suggestions'],
  propertyOrdering: ['reply', 'focusIds', 'openId', 'suggestions'],
};

/** Returns null when no key is configured, so the chat handler answers offline. */
export function createGeminiGenerate(apiKey: string | undefined, model = DEFAULT_MODEL): Generate | null {
  if (!apiKey) return null;
  // No SDK retries: a 429 or 5xx should fall back offline inside the 8s budget, not back off for a minute.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return async ({ systemInstruction, contents }, signal) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
        abortSignal: signal,
      },
    });
    const text = response.text;
    if (!text) throw new Error('empty model response');
    return text;
  };
}
