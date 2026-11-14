import type { Request, Response } from 'express';
import { catalog as defaultCatalog, events as defaultEvents } from '../src/data/catalog';
import { createGuideAgent, type GuideAgent, type GuideAgentDeps } from './guideAgent';
import { parseChatRequest } from './request';

export type ChatDeps = Partial<GuideAgentDeps> & { agent?: GuideAgent };

/** POST /api/chat: ChatRequest in, the GuideAgent's reply out. 400 only for a malformed body. */
export function createChatHandler(deps: ChatDeps = {}) {
  const agent =
    deps.agent ??
    createGuideAgent({ ...deps, step: deps.step ?? null, catalog: deps.catalog ?? defaultCatalog, events: deps.events ?? defaultEvents });
  const validIds = new Set((deps.catalog ?? defaultCatalog).map((c) => c.id));
  return async (req: Request, res: Response) => {
    const parsed = parseChatRequest(req.body, validIds);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(await agent.ask(parsed.turns, parsed.profile, parsed.extracted));
  };
}
