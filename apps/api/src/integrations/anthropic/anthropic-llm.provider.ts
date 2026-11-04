import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { activeSizes, DEBRIS_LABELS } from '@oraviq/pricing';
import type { ConversationFacts, Placement } from '@oraviq/shared';
import type { AssistantTools, AssistantTurnInput, AssistantTurnOutput, LlmProvider, ReviewDraftInput } from '../types';

/** The only handoff reasons the model may give; each maps to a fixed sentence shown and texted to the owner. */
export const HANDOFF_REASONS = {
  prohibited_item: "The customer mentioned items you don't take.",
  outside_service_area: 'The ZIP is outside your delivery zones; a price is needed.',
  heavy_debris_size: "Concrete, dirt or brick in a size that doesn't allow it.",
  asked_for_person: 'The customer asked for a person.',
  cannot_price: "The assistant couldn't price this job.",
  other: 'The assistant needs your help with this conversation.',
} as const;
export type HandoffReason = keyof typeof HANDOFF_REASONS;

/**
 * Claude (Haiku 4.5 by default) through the Messages API with tool use.
 * The model gathers facts and calls tools; prices come only from get_quote,
 * whose result carries the code-rendered sentence the model must use verbatim.
 * The orchestrator still runs the unbacked-amount guardrail on the final text.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly logger = new Logger('AnthropicLlm');

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  private static readonly TOOLS: Anthropic.Tool[] = [
    {
      name: 'get_quote',
      description:
        'Price a dumpster rental from the business price list. The ONLY source of prices. Returns the exact sentence to send the customer.',
      input_schema: {
        type: 'object',
        properties: {
          yards: { type: 'integer', description: 'Container size in cubic yards' },
          days: { type: 'integer', description: 'Rental days' },
          zip: { type: 'string', description: '5-digit delivery ZIP' },
          debris: { type: 'string', enum: ['household', 'construction', 'heavy'] },
          items: { type: 'object', description: 'Surcharge item counts, e.g. {"mattress": 2}', additionalProperties: { type: 'integer' } },
        },
        required: ['yards', 'zip', 'debris'],
      },
    },
    {
      name: 'check_service_area',
      description: 'Check whether a ZIP code is inside the delivery zones.',
      input_schema: { type: 'object', properties: { zip: { type: 'string' } }, required: ['zip'] },
    },
    {
      name: 'create_order_draft',
      description: 'Send an order request to the owner after the customer accepted a quote and gave the address and delivery day.',
      input_schema: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          date: { type: 'string', description: 'Delivery day as the customer said it, or YYYY-MM-DD' },
          placement: { type: 'string', enum: ['driveway', 'street', 'other'] },
          name: { type: 'string' },
        },
        required: ['address', 'date'],
      },
    },
    {
      name: 'handoff_to_human',
      description:
        'Hand the conversation to the owner: prohibited items, ZIP outside the zones, concrete/dirt in a size that does not allow it, anything you cannot price or answer, or the customer asks for a person.',
      input_schema: { type: 'object', properties: { reason: { type: 'string', enum: Object.keys(HANDOFF_REASONS) } }, required: ['reason'] },
    },
  ];

  private systemPrompt(input: AssistantTurnInput): string {
    const t = input.priceTable;
    const sizes = activeSizes(t)
      .map((s) => `${s.yards}-yard (${s.includedTons} tons included${s.heavyAllowed ? ', concrete/dirt allowed' : ''})${s.hint ? `: ${s.hint}` : ''}`)
      .join('; ');
    return [
      `You are the automated text assistant for ${input.businessName}, a dumpster rental company${input.businessPhone ? ` (phone ${input.businessPhone})` : ''}.`,
      'Goal: quote the customer and collect what is needed to book: size, ZIP, rental days, debris type, delivery address, delivery day, placement (driveway or street).',
      'Rules you never break:',
      '- Never state a price, fee or dollar amount yourself. Call get_quote and use its "sentence" field verbatim. Only dollar amounts from tool results may appear in your reply.',
      '- Your first message in a conversation must say you are an automated assistant.',
      '- Prohibited items, ZIPs outside the zones, concrete/dirt in a size that does not allow it, requests for a person, or anything you cannot answer: call handoff_to_human and tell the customer the owner will follow up.',
      '- Once the customer accepts a quote and gives the address and day, call create_order_draft. Tell them the owner will confirm the drop-off time and text a deposit link.',
      '- Street placement may need a city permit; mention the owner will check.',
      '- Plain, short text messages. No markdown, no emojis. One question at a time.',
      `Sizes: ${sizes}. Rentals include ${t.includedDays} days; longest rental without the owner: ${t.maxDays} days.`,
      `Debris types: ${Object.entries(DEBRIS_LABELS).map(([k, v]) => `${k} = ${v}`).join('; ')}.`,
      `Prohibited: ${t.prohibited.join(', ')}.`,
      `Surcharge items (use these keys in get_quote items): ${t.surcharges.map((s) => `${s.key} (${s.label})`).join(', ')}.`,
    ].join('\n');
  }

  async runAssistantTurn(input: AssistantTurnInput, tools: AssistantTools): Promise<AssistantTurnOutput> {
    const facts: ConversationFacts = { ...input.facts };
    const aiState = { ...input.aiState };
    const context = [
      `Known facts: ${JSON.stringify(facts)}.`,
      `Customer: ${input.customer.name ?? 'unknown'}${input.customer.isRepeat ? ' (repeat customer)' : ''}${input.customer.lastOrder ? `; last order ${JSON.stringify(input.customer.lastOrder)}` : ''}.`,
      `Channel: ${input.channel}. Introduced already: ${aiState.introduced ? 'yes' : 'no'}.`,
    ].join(' ');

    const messages: Anthropic.MessageParam[] = [];
    for (const m of input.history.slice(-20)) {
      if (m.author === 'system') continue;
      const role = m.author === 'customer' ? 'user' : 'assistant';
      const last = messages[messages.length - 1];
      if (last && last.role === role && typeof last.content === 'string') last.content += `\n${m.body}`;
      else messages.push({ role, content: m.body });
    }
    if (messages[0]?.role === 'assistant') messages.unshift({ role: 'user', content: '(conversation started)' });
    const userTurn = `${input.text}\n\n[context: ${context}]`;
    const last = messages[messages.length - 1];
    if (last && last.role === 'user' && typeof last.content === 'string') last.content += `\n${userTurn}`;
    else messages.push({ role: 'user', content: userTurn });

    let traceId = '';
    let reply = '';
    for (let round = 0; round < 6; round++) {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 600,
        // Prompt caching: the system prompt is identical across turns for a tenant.
        system: [{ type: 'text', text: this.systemPrompt(input), cache_control: { type: 'ephemeral' } }],
        tools: AnthropicLlmProvider.TOOLS,
        messages,
      });
      traceId = res.id;
      const toolUses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
      reply = res.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();
      if (res.stop_reason !== 'tool_use' || !toolUses.length) break;
      messages.push({ role: 'assistant', content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const args = (tu.input ?? {}) as Record<string, any>;
        let out: unknown;
        try {
          if (tu.name === 'get_quote') {
            facts.yards = Number(args.yards);
            facts.zip = String(args.zip);
            if (args.days) facts.days = Number(args.days);
            facts.debris = args.debris;
            if (args.items) facts.items = args.items;
            const q = await tools.getQuote({ yards: Number(args.yards), days: args.days ? Number(args.days) : undefined, zip: String(args.zip), debris: args.debris, items: args.items });
            out = q.ok ? { ok: true, sentence: q.sentence, totalCents: q.quote.totalCents, lineItems: q.quote.lineItems } : { ok: false, error: q.error };
            if (q.ok) {
              aiState.quoteId = q.quoteId;
              aiState.quoteTotalCents = q.quote.totalCents;
              aiState.stage = 'booking';
            }
          } else if (tu.name === 'check_service_area') {
            facts.zip = String(args.zip);
            out = await tools.checkServiceArea(String(args.zip));
          } else if (tu.name === 'create_order_draft') {
            facts.address = String(args.address);
            facts.date = String(args.date);
            if (args.placement) facts.placement = args.placement as Placement;
            if (args.name) facts.name = String(args.name);
            out = await tools.createOrderDraft({ address: facts.address, date: facts.date, placement: (args.placement as Placement) ?? null, name: args.name ?? null });
            aiState.stage = 'booked';
          } else if (tu.name === 'handoff_to_human') {
            // Fixed owner-facing sentences only: a customer can't steer the text the owner is sent.
            const sentence = HANDOFF_REASONS[String(args.reason) as HandoffReason] ?? HANDOFF_REASONS.other;
            await tools.handoffToHuman(sentence);
            aiState.handoff = sentence;
            out = { ok: true };
          } else {
            out = { ok: false, error: `Unknown tool ${tu.name}` };
          }
        } catch (e) {
          this.logger.warn(`Tool ${tu.name} failed: ${(e as Error).message}`);
          out = { ok: false, error: (e as Error).message };
        }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: results });
    }
    aiState.introduced = true;
    return { reply, facts, aiState, traceId };
  }

  async draftReviewReply(input: ReviewDraftInput): Promise<{ text: string; traceId: string }> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: `You write public replies to customer reviews for ${input.businessName}, a dumpster rental company. 1 to 3 short sentences, warm and specific, no emojis, no prices or promises of refunds. For ratings of 2 or less: apologise plainly, take responsibility, and say the team will call today. Sign low-rating replies "The ${input.businessName} team".`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Source: ${input.source}. Author: ${input.author}. Rating: ${input.rating ?? (input.recommends ? 'recommends' : 'n/a')}.\nReview: ${input.text}\n${input.previousDrafts.length ? `Write something different from these drafts:\n- ${input.previousDrafts.join('\n- ')}` : ''}\nReply with the text only.`,
        },
      ],
    });
    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join(' ')
      .trim();
    return { text, traceId: res.id };
  }
}

