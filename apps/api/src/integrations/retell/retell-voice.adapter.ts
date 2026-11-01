import { Logger } from '@nestjs/common';
import type { VoiceAgentAdapter, VoiceAgentSync } from '../types';
import { verifyRetellSignature } from '../mock/mock-voice-agent.adapter';

const VOICES: Record<string, string> = { warm: '11labs-Adrian', clear: '11labs-Myra', calm: '11labs-Brian' };

/**
 * Retell voice agent. Calls reach Retell over SIP from the Zernio number; the
 * agent's LLM calls our custom functions (POST /api/v1/voice/tools/:tool) and
 * Retell posts call_started / call_ended / call_analyzed to /api/v1/webhooks/retell.
 * Both are signed with x-retell-signature (HMAC-SHA256 with the API key).
 */
export class RetellVoiceAgentAdapter implements VoiceAgentAdapter {
  readonly provider = 'retell' as const;
  private readonly logger = new Logger('Retell');
  private readonly base = 'https://api.retellai.com';

  constructor(
    private readonly apiKey: string,
    private readonly signingKey: string,
  ) {}

  private async call<T>(method: 'POST' | 'PATCH' | 'GET', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) {
      this.logger.warn(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
      throw new Error(`Retell ${path} failed (${res.status})`);
    }
    return data;
  }

  async syncAgent(input: VoiceAgentSync): Promise<{ agentId: string }> {
    const s = input.settings;
    const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
      type: 'custom',
      name,
      description,
      url: `${input.toolsBaseUrl}/${name}`,
      speak_during_execution: false,
      speak_after_execution: true,
      parameters: { type: 'object', properties, required },
    });
    const general_tools: unknown[] = [
      tool('get_quote', 'Price a rental. The only source of prices; read back the returned sentence exactly.', { yards: { type: 'integer' }, days: { type: 'integer' }, zip: { type: 'string' }, debris: { type: 'string', enum: ['household', 'construction', 'heavy'] } }, ['yards', 'zip', 'debris']),
      tool('check_zip', 'Check whether a ZIP is in the delivery area.', { zip: { type: 'string' } }, ['zip']),
      tool('lookup_customer', 'Look up the caller by phone number for repeat-customer details.', {}, []),
      tool('create_order_draft', 'Send the order request to the owner once the caller accepts the quote.', { address: { type: 'string' }, date: { type: 'string' }, placement: { type: 'string', enum: ['driveway', 'street', 'other'] } }, ['address', 'date']),
      tool('send_quote_sms', 'Text the caller the quote they were given.', {}, []),
      { type: 'end_call', name: 'end_call', description: 'End the call when the caller is done.' },
    ];
    if (s.transferNumber && (s.transferWhenAsked || s.transferWhenOutsideRules)) {
      general_tools.push({
        type: 'transfer_call',
        name: 'transfer_to_owner',
        description: `Transfer to the owner when ${[s.transferWhenAsked ? 'the caller asks for a person' : '', s.transferWhenOutsideRules ? 'the job is outside the rules (heavy debris in a big size, out of area, prohibited items)' : ''].filter(Boolean).join(' or ')}.`,
        transfer_destination: { type: 'predefined', number: s.transferNumber },
      });
    }
    const general_prompt = [
      `You answer the phone for ${input.businessName}, a dumpster rental company. You are an automated assistant and calls may be recorded.`,
      'Collect size, ZIP, days and what is going in. Never say a price yourself: call get_quote and read its sentence. Offer to text the quote (send_quote_sms).',
      'To book, get the delivery address and day, then call create_order_draft. Tell the caller the owner will confirm the drop-off time by text.',
      s.spanish ? 'If the caller speaks Spanish, continue in Spanish.' : 'Speak English.',
    ].join('\n');

    let llmId: string | null = null;
    let agentId = s.agentId;
    if (agentId) {
      const agent = await this.call<any>('GET', `/get-agent/${agentId}`);
      llmId = agent?.response_engine?.llm_id ?? null;
    }
    if (llmId) {
      await this.call('PATCH', `/update-retell-llm/${llmId}`, { general_prompt, begin_message: s.greeting, general_tools });
    } else {
      const llm = await this.call<any>('POST', '/create-retell-llm', { general_prompt, begin_message: s.greeting, general_tools, model: 'gpt-4.1-mini' });
      llmId = llm.llm_id;
    }
    const agentBody = {
      response_engine: { type: 'retell-llm', llm_id: llmId },
      voice_id: VOICES[s.voice] ?? VOICES.warm,
      agent_name: `${input.businessName} receptionist`,
      language: s.spanish ? 'multi' : 'en-US',
      webhook_url: input.webhookUrl,
      metadata: { tenantId: input.tenantId },
    };
    if (agentId) await this.call('PATCH', `/update-agent/${agentId}`, agentBody);
    else agentId = (await this.call<any>('POST', '/create-agent', agentBody)).agent_id;
    return { agentId: agentId! };
  }

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    return verifyRetellSignature(rawBody, this.signingKey, signature);
  }
}
