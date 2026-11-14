import type { CampusEvent, Community } from '../src/data/types';
import type { Profile } from '../src/profile/profile';
import type { GuideReply } from '../shared/guide';
import { answerOffline, parseGuideJson, type Turn } from '../shared/conversation';
import { applyExtracted, type Extracted } from '../src/data/extracted';
import { buildContents, buildSystemPrompt } from './prompt';
import type { ChatContent, Step, StepResult } from './step';
import { runTool, traceLine } from './tools';
import { checkReply } from './validator';
import { withTimeout } from './timeout';

export const TIMEOUT_MS = 7000;
export const BUDGET_MS = 16000;
/** Tool rounds + answer + one repair. */
export const MAX_STEPS = 5;
const MAX_TOOL_ROUNDS = 3;
/** Tool calls run per model turn. */
const MAX_CALLS = 4;

export interface GuideAgentDeps {
  /** The model seam; null (no API key) answers every turn offline. */
  step: Step | null;
  catalog: Community[];
  events: CampusEvent[];
  /** Per-step timeout and whole-turn budget. */
  timeoutMs?: number;
  budgetMs?: number;
  /** Injectable clock (ms) for the budget. */
  now?: () => number;
  log?: (msg: string) => void;
}

export interface GuideAgent {
  /** Answers the latest user turn. Always resolves: Gemini when it can, the offline matcher otherwise. */
  ask(turns: Turn[], profile: Profile | null, extracted?: Extracted): Promise<GuideReply>;
}

/**
 * GuideAgent: plan with tools -> answer as JSON actions -> validate -> repair once.
 * Retry and the step budget live here; model choice and fallback live in the Step adapter.
 */
export function createGuideAgent(deps: GuideAgentDeps): GuideAgent {
  const { catalog: baseCatalog, events } = deps;
  const validIds = new Set(baseCatalog.map((c) => c.id));
  const systemInstruction = buildSystemPrompt(baseCatalog);
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const budgetMs = deps.budgetMs ?? BUDGET_MS;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.warn(`[guide] ${m}`));

  async function run(step: Step, turns: Turn[], profile: Profile | null, catalog: Community[]): Promise<GuideReply | null> {
    const contents: ChatContent[] = buildContents(turns, profile);
    const trace: string[] = [];
    const started = now();
    const left = () => budgetMs - (now() - started);
    const toolCtx = { catalog, events, profile };
    let toolRounds = 0;
    let repaired = false;
    let retried = false;
    let candidate: GuideReply | null = null;
    const weekAdds: string[] = [];
    const finish = (reply: GuideReply): GuideReply =>
      weekAdds.length ? { ...reply, actions: [{ type: 'add_to_week', ids: [...new Set(weekAdds)] }] } : reply;

    for (let i = 0; i < MAX_STEPS; i++) {
      if (left() < 1000) break;
      const tools = !repaired && toolRounds < MAX_TOOL_ROUNDS;
      const forceTool = tools && toolRounds === 0;
      let attempt = 0;
      const call = (signal: AbortSignal) => step({ systemInstruction, contents, tools, forceTool, attempt }, signal);
      let r: StepResult;
      try {
        r = await withTimeout(call, Math.min(timeoutMs, left()));
      } catch (err) {
        // One retry per turn (cold start, 503 high demand); after that keep the best answer so far.
        if (retried || left() < 1000) {
          if (candidate) break;
          throw err;
        }
        retried = true;
        attempt = 1;
        log(`model call failed, retrying once: ${(err as Error)?.message ?? err}`);
        try {
          r = await withTimeout(call, Math.min(timeoutMs, left()));
        } catch (retryErr) {
          // The retry failed too: keep a grounded (if flagged) answer rather than drop to offline.
          if (candidate) break;
          throw retryErr;
        }
      }

      if (tools && r.calls?.length) {
        toolRounds++;
        const calls = r.calls;
        contents.push(r.content ?? { role: 'model', parts: calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })) });
        // Gemini needs one response per call: the first MAX_CALLS run, the rest are answered as skipped.
        const results = calls.map((c, k) =>
          k < MAX_CALLS ? runTool(c, toolCtx) : { error: `Skipped: at most ${MAX_CALLS} tool calls per turn. Call it again next turn if needed.` },
        );
        contents.push({
          role: 'user',
          parts: calls.map((c, k) => ({ functionResponse: { id: c.id, name: c.name, response: results[k] } })),
        });
        calls.slice(0, MAX_CALLS).forEach((c, k) => {
          const added = c.name === 'add_to_week' ? (results[k].added as string[] | undefined) : undefined;
          if (added?.length) weekAdds.push(...added);
          trace.push(c.name === 'add_to_week' ? weekTrace(results[k], catalog) : traceLine(c, catalog));
        });
        continue;
      }

      const parsed = r.text ? parseGuideJson(r.text, validIds) : null;
      if (!parsed) {
        if (repaired) break;
        repaired = true;
        contents.push({ role: 'model', parts: [{ text: r.text ?? '' }] });
        contents.push({ role: 'user', parts: [{ text: '[Validator] Your answer was not valid JSON with reply, focusIds and suggestions. Answer again as JSON.' }] });
        continue;
      }
      const problems = checkReply(parsed.reply, catalog, { events, profile, focusIds: parsed.focusIds });
      // An action claim must match what the add_to_week tool actually did.
      if (claimsAdd(parsed.reply) && !weekAdds.length)
        problems.push('The reply says something was added to the week, but add_to_week added nothing. Do not claim it.');
      if (!problems.length) {
        trace.push(repaired ? 'Fixed and re-checked the answer' : 'Checked the answer against the catalog');
        return finish({ ...parsed, trace });
      }
      if (repaired) {
        // Second answer still flagged: ids are already grounded, so keep it rather than lose the turn.
        trace.push('Checked the answer (some wording could not be verified)');
        return finish({ ...parsed, trace });
      }
      candidate = finish({ ...parsed, trace: [...trace, 'Checked the answer (some wording could not be verified)'] });
      repaired = true;
      log(`validator: ${problems.join(' | ')}`);
      trace.push(`Validator caught ${problems.length} issue${problems.length > 1 ? 's' : ''}; asked Gemini to fix`);
      contents.push({ role: 'model', parts: [{ text: r.text! }] });
      contents.push({
        role: 'user',
        parts: [{ text: `[Validator] Your answer has problems:\n- ${problems.join('\n- ')}\nReturn the corrected JSON answer.` }],
      });
    }
    return candidate;
  }

  return {
    async ask(turns, profile, extracted = {}) {
      // Fine print the student's device read from club posts overrides sample fine print for this turn.
      const catalog = applyExtracted(baseCatalog, extracted);
      if (deps.step) {
        try {
          const reply = await run(deps.step, turns, profile, catalog);
          if (reply) return reply;
          log('agent produced no usable answer; answering offline');
        } catch (err) {
          const status = (err as { status?: number })?.status;
          log(`model call failed${status ? ` (${status})` : ''}: ${(err as Error)?.message ?? err}; answering offline`);
        }
      }
      return answerOffline(turns, { catalog, events, profile });
    },
  };
}


const ADDED_CLAIM = /\b(added|i've put|i have put|scheduled)\b[^.]*\b(week|plan|timetable)\b/i;
const NEGATED = /\b(no|not|nothing|never|none|until|once|if|can'?t|couldn'?t|won'?t|haven'?t|hasn'?t|wasn'?t|didn'?t)\b|n't\b/i;

/** A sentence that says something WAS added (not "nothing was added", "once you set free times"). */
function claimsAdd(reply: string): boolean {
  return reply.split(/(?<=[.!?])\s+/).some((s) => ADDED_CLAIM.test(s) && !NEGATED.test(s));
}

function weekTrace(result: Record<string, unknown>, catalog: Community[]): string {
  const name = (id: string) => catalog.find((c) => c.id === id)?.shortName ?? id;
  const added = (result.added as string[] | undefined) ?? [];
  if (added.length) return `Added ${added.map(name).join(', ')} to your week`;
  return result.error ? 'Asked for your free times first' : 'Nothing fitted your free times';
}
