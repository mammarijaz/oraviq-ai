import { randomUUID } from 'node:crypto';
import { AssistantBrain } from '../../modules/ai/brain/brain';
import type { AssistantTools, AssistantTurnInput, AssistantTurnOutput, LlmProvider, ReviewDraftInput } from '../types';

/**
 * Deterministic stand-in for the LLM: the prototype's parser and state machine.
 * Same tools, same guardrails, same reply quality as the approved prototype.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  private readonly brain = new AssistantBrain();

  async runAssistantTurn(input: AssistantTurnInput, tools: AssistantTools): Promise<AssistantTurnOutput> {
    const res = await this.brain.turn(
      { businessName: input.businessName, table: input.priceTable, customer: input.customer },
      input.facts,
      input.aiState,
      input.text,
      tools,
    );
    return { reply: res.reply, facts: res.facts, aiState: res.state, traceId: `mock_${randomUUID()}` };
  }

  async draftReviewReply(input: ReviewDraftInput): Promise<{ text: string; traceId: string }> {
    const traceId = `mock_${randomUUID()}`;
    // Like the prototype's "Try another draft": cycle through the drafts already written for this review.
    const distinct = [...new Set(input.previousDrafts)];
    if (distinct.length >= 2 && input.currentDraft) {
      const i = distinct.indexOf(input.currentDraft);
      return { text: distinct[(i + 1) % distinct.length], traceId };
    }
    const variants = reviewTemplates(input);
    const used = new Set(input.previousDrafts);
    const text = variants.find((v) => !used.has(v)) ?? variants[input.previousDrafts.length % variants.length];
    return { text, traceId };
  }
}

function firstName(author: string): string {
  return author.trim().split(/\s+/)[0] || 'there';
}

/** Short, specific, human replies in the prototype's voice. Low ratings apologise and offer a call. */
export function reviewTemplates(r: ReviewDraftInput): string[] {
  const name = firstName(r.author);
  const team = `The ${r.businessName.replace(/\s+(Co\.?|LLC|Inc\.?)$/i, '')} team`;
  const t = r.text.toLowerCase();
  const positive = r.recommends === true || (r.rating ?? 0) >= 4;
  const mixed = (r.rating ?? 0) === 3 || (r.rating === 4 && /would have|wish|but|only/.test(t));
  if (!positive && !mixed) {
    const issue = /late|hours|wait|delay/.test(t) ? 'the delay' : /price|charge|fee|bill/.test(t) ? 'the charges' : /damage|grass|driveway/.test(t) ? 'the damage' : 'your experience';
    return [
      `${name}, we're sorry about ${issue}. That isn't the service we aim for, and it's on us. We'd like to make it right and will call you today. ${team}`,
      `${name}, thank you for telling us, and we're sorry about ${issue}. We're fixing what went wrong so it doesn't happen again, and we'll call you today to make it right. ${team}`,
    ];
  }
  if (mixed) {
    return [
      `Thanks, ${name}, and fair point. We've taken it on board so the next rental is smoother. Glad the rest went well.`,
      `Thank you, ${name}. You're right, and we're making that change. Hope the project went well.`,
    ];
  }
  const detail = /price|quote/.test(t)
    ? 'Glad the quick, clear price helped.'
    : /driver|drop|placed|where i asked/.test(t)
      ? 'Putting it exactly where you need it is the job.'
      : /weight|fee|surprise/.test(t)
        ? 'No surprises is the goal.'
        : 'Glad it went smoothly.';
  return [
    `Thanks, ${name}. ${detail} We're here whenever you need the next one.`,
    `Thank you for the kind words, ${name}. ${detail} Call or text any time you need another dumpster.`,
  ];
}
