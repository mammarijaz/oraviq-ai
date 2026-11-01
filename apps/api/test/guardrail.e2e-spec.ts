import type { AssistantTools, AssistantTurnInput, AssistantTurnOutput, LlmProvider } from '../src/integrations/types';
import { LLM_PROVIDER } from '../src/integrations/types';
import { MockLlmProvider } from '../src/integrations/mock/mock-llm.provider';
import { createTestApp, registerTenant, type TestApp } from './helpers';

/** An LLM that makes up a price instead of calling get_quote. */
class InventingLlm implements LlmProvider {
  readonly name = 'fake';
  mode: 'invent' | 'quote-then-invent' | 'no-disclosure' = 'invent';
  async runAssistantTurn(input: AssistantTurnInput, tools: AssistantTools): Promise<AssistantTurnOutput> {
    if (this.mode === 'quote-then-invent') {
      const q = await tools.getQuote({ yards: 20, days: 10, zip: '30319', debris: 'construction' });
      const sentence = q.ok ? q.sentence : '';
      return { reply: `${sentence} Plus a $500 cleaning fee.`, facts: input.facts, aiState: { ...input.aiState, introduced: true }, traceId: 'fake' };
    }
    if (this.mode === 'no-disclosure') return { reply: 'What size do you need?', facts: input.facts, aiState: input.aiState, traceId: 'fake' };
    return { reply: 'Sure, a 20-yard is $500 delivered.', facts: input.facts, aiState: { ...input.aiState, introduced: true }, traceId: 'fake' };
  }
  draftReviewReply = new MockLlmProvider().draftReviewReply;
}

describe('guardrails', () => {
  let t: TestApp;
  const llm = new InventingLlm();
  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(LLM_PROVIDER).useValue(llm));
  });
  afterAll(() => t.close());

  it('blocks a reply with a dollar amount not backed by a quote and hands off', async () => {
    llm.mode = 'invent';
    const reg = await registerTenant(t, 'Guard');
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0160', body: 'how much is a 20 yard?' }).expect(200);
    // Nothing with $500 went to the customer.
    const outbound = await t.prisma.message.findMany({ where: { conversationId: r.body.conversationId, direction: 'outbound' } });
    expect(outbound.some((m) => m.body.includes('$500'))).toBe(false);
    expect(r.body.replies[0].body).not.toContain('$');
    expect(r.body.replies[0].body).toMatch(/automated assistant/);
    const d = await t.http().get(`/api/v1/conversations/${r.body.conversationId}`).set(reg.auth).expect(200);
    expect(d.body.state).toBe('needs_you');
    expect(d.body.handoffReason).toContain('$500');
    expect(d.body.messages.some((m: any) => m.author === 'system' && /Blocked an assistant reply/.test(m.body))).toBe(true);
  });

  it('still blocks when a real quote exists but the reply adds an unbacked fee', async () => {
    llm.mode = 'quote-then-invent';
    const reg = await registerTenant(t, 'Guard2');
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0161', body: 'price for a 20 yard in 30319, 10 days, remodel' }).expect(200);
    expect(r.body.replies[0].body).not.toContain('$500');
    const d = await t.http().get(`/api/v1/conversations/${r.body.conversationId}`).set(reg.auth).expect(200);
    expect(d.body.state).toBe('needs_you');
    expect(d.body.latestQuote.totalCents).toBe(72000);
  });

  it('adds the automated-assistant disclosure when the model forgets it', async () => {
    llm.mode = 'no-disclosure';
    const reg = await registerTenant(t, 'Guard3');
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0162', body: 'hi' }).expect(200);
    expect(r.body.replies[0].body).toMatch(/^Hi, this is .*'s automated assistant\. What size do you need\?$/);
  });
});
