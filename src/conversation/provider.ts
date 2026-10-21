/**
 * Response provider seam. The UI only talks to a SunnyProvider.
 *
 * Today: `scriptedProvider` (keyword intents + deterministic engine).
 * Future: an LLM-backed provider could implement the same interface, e.g. by
 * classifying free text into a SunnyEvent and rephrasing Sunny's copy, while
 * still delegating facts and arithmetic to `reduce`. Not implemented here.
 */
import { reduce } from './engine';
import { interpretText } from './intents';
import type { ConversationState, CustomerTurn } from './types';

export interface SunnyProvider {
  /** Map typed customer text to a structured turn. */
  interpret(text: string, state: ConversationState): Promise<CustomerTurn>;
  /** Produce the next conversation state for a customer turn. */
  respond(state: ConversationState, turn: CustomerTurn): Promise<ConversationState>;
}

export const scriptedProvider: SunnyProvider = {
  interpret: async (text, state) => interpretText(text, state),
  respond: async (state, turn) => reduce(state, turn),
};
