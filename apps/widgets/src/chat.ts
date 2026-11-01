/* Website chat widget (iframe). Every reply comes from the hauler's assistant on the API. */
import './styles/widget.css';
import type { PublicBusinessDto, PublicChatStartResponse } from '@oraviq/shared';
import { api, applyAccent, embedded, esc, KEY, post } from './common';

type Msg = { author: 'assistant' | 'customer'; body: string };
const root = document.getElementById('app')!;
document.documentElement.classList.add('chat');

const storeKey = `oraviq.chat.${KEY}`;
const store = {
  get(): string | null { try { return sessionStorage.getItem(storeKey); } catch { return null; } },
  set(v: string) { try { sessionStorage.setItem(storeKey, v); } catch { /* storage blocked: session lives in memory */ } },
};

let biz: PublicBusinessDto | null = null;
let sessionId: string | null = null;
let messages: Msg[] = [];
let typing = false;
let started = false;
const QUICK = ['I need a dumpster', "What sizes do you have?", 'Do you deliver to my ZIP?'];

function render() {
  const name = biz?.name ?? 'Chat';
  root.innerHTML = `<div class="wchat">
    <div class="wchat-head"><div><b>${esc(name)}</b><span>Replies in seconds, day or night</span></div>
      ${embedded ? '<button type="button" data-close aria-label="Close chat"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>' : ''}</div>
    <div class="wchat-thread" id="thread" role="log" aria-live="polite" aria-label="Conversation">
      ${messages.map((m) => `<div class="wmsg wmsg--${m.author === 'customer' ? 'me' : 'them'}">${esc(m.body)}</div>`).join('')}
      ${typing ? '<div class="wmsg wmsg--them wmsg--typing" aria-label="Typing"><i></i><i></i><i></i></div>' : ''}
    </div>
    ${messages.filter((m) => m.author === 'customer').length === 0 ? `<div class="chips">${QUICK.map((q) => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
    <form id="form"><label class="sr" for="input">Message</label><input class="input" id="input" autocomplete="off" placeholder="Type a message" maxlength="1000"><button>Send</button></form>
    <div class="wchat-foot">Automated assistant · Powered by Oraviq AI</div></div>`;
  const t = document.getElementById('thread');
  if (t) t.scrollTop = t.scrollHeight;
}

async function start() {
  if (started) return;
  started = true;
  const saved = store.get();
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { sessionId: string; messages: Msg[] };
      sessionId = parsed.sessionId;
      messages = parsed.messages;
      render();
      return;
    } catch { /* fall through to a new session */ }
  }
  try {
    const r = await api<PublicChatStartResponse>('/chat/start', {});
    sessionId = r.sessionId;
    messages = r.messages.map((m) => ({ author: m.author, body: m.body }));
  } catch {
    messages = [{ author: 'assistant', body: 'Chat is unavailable right now. Please call us.' }];
  }
  save();
  render();
}

function save() { if (sessionId) store.set(JSON.stringify({ sessionId, messages })); }

async function send(text: string) {
  const body = text.trim();
  if (!body || !sessionId || typing) return;
  messages.push({ author: 'customer', body });
  typing = true;
  render();
  try {
    const r = await api<{ messages: Array<{ author: 'assistant' | 'customer'; body: string }> }>('/chat/message', { sessionId, body });
    for (const m of r.messages) if (m.author === 'assistant') messages.push({ author: 'assistant', body: m.body });
  } catch (e) {
    messages.push({ author: 'assistant', body: (e as Error).message || 'Sorry, that did not send. Please try again.' });
  }
  typing = false;
  save();
  render();
  (document.getElementById('input') as HTMLInputElement | null)?.focus();
}

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const i = document.getElementById('input') as HTMLInputElement;
  const v = i.value;
  i.value = '';
  void send(v);
});
root.addEventListener('click', (e) => {
  const t = e.target as Element;
  const q = t.closest<HTMLElement>('[data-quick]');
  if (q) { void send(q.dataset.quick!); return; }
  if (t.closest('[data-close]')) post('oraviq:close');
});
window.addEventListener('message', (e) => {
  if (e.source === window.parent && e.data?.type === 'oraviq:open') (document.getElementById('input') as HTMLInputElement | null)?.focus();
});

applyAccent();
render();
api<PublicBusinessDto>('/business')
  .then((b) => { biz = b; applyAccent(new URLSearchParams(location.search).get('accent') ?? b.accentColor); render(); })
  .catch(() => undefined)
  .finally(() => { void start().then(() => { (document.getElementById('input') as HTMLInputElement | null)?.focus(); post('oraviq:ready'); }); });
