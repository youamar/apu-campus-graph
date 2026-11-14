/**
 * The Step seam: one model turn of the guide agent. Two adapters satisfy it:
 * the Gemini adapter (server/gemini.ts) in production and scripted steps in tests.
 */

export type ChatRole = 'user' | 'model';

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatPart {
  text?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}

export interface ChatContent {
  role: ChatRole;
  parts: ChatPart[];
}

export interface StepPrompt {
  systemInstruction: string;
  contents: ChatContent[];
  /** false on the final/repair step: the model must answer instead of calling tools. */
  tools?: boolean;
  /** true on the first step: the model must call a tool (plan before answering). */
  forceTool?: boolean;
  /** 0 normally; 1+ on a retry, so the adapter can switch to a backup model. */
  attempt?: number;
}

/** Either tool calls to run, or the final JSON answer text. */
export interface StepResult {
  text?: string;
  calls?: ToolCall[];
  /** The model turn exactly as returned (keeps any thought signatures for the next step). */
  content?: ChatContent;
}

export type Step = (prompt: StepPrompt, signal: AbortSignal) => Promise<StepResult>;
