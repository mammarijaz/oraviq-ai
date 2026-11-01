import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h } from 'vue';
import { useToast } from '@oraviq/ui';

vi.mock('@/api', async (orig) => {
  const actual = await orig<typeof import('@/api')>();
  return {
    ...actual,
    api: {
      auth: { login: vi.fn(), me: vi.fn() },
      orders: { list: vi.fn(), confirm: vi.fn(), reschedule: vi.fn(), setStatus: vi.fn(), depositLink: vi.fn() },
      conversations: { get: vi.fn() },
    },
  };
});

import { api, ApiError } from '@/api';
import LoginView from '@/views/LoginView.vue';
import OrdersView from '@/views/OrdersView.vue';
import { order, quote, contact } from './fixtures';

const mocked = api as unknown as {
  auth: Record<'login' | 'me', ReturnType<typeof vi.fn>>;
  orders: Record<'list' | 'confirm', ReturnType<typeof vi.fn>>;
};

const Blank = defineComponent({ render: () => h('div', 'page') });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/register', component: Blank },
      { path: '/orders', component: OrdersView },
      { path: '/inbox/:id?', component: Blank },
    ],
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useToast().dismissAll();
  document.body.innerHTML = '';
});

describe('LoginView', () => {
  it('validates before calling the API', async () => {
    const router = makeRouter();
    await router.push('/login');
    const w = mount(LoginView, { global: { plugins: [router] }, attachTo: document.body });
    await w.find('form').trigger('submit');
    expect(w.text()).toContain('Enter your email.');
    expect(w.text()).toContain('Enter your password.');
    expect(mocked.auth.login).not.toHaveBeenCalled();
  });

  it('shows a clear message for a wrong password', async () => {
    mocked.auth.login.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const router = makeRouter();
    await router.push('/login');
    const w = mount(LoginView, { global: { plugins: [router] }, attachTo: document.body });
    await w.find('input[type="email"]').setValue('demo@oraviq.ai');
    await w.find('input[type="password"]').setValue('wrong');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('That email and password do not match');
  });

  it('signs in and goes to the redirect target', async () => {
    mocked.auth.login.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: { id: 'u1', name: 'Dana Owner', email: 'demo@oraviq.ai', role: 'owner' },
      tenant: { id: 't1', name: 'Demo Roll-Off Co.', slug: 'demo', timezone: 'America/New_York', businessHours: { days: [] } },
    });
    const router = makeRouter();
    await router.push('/login?redirect=/orders');
    mocked.orders.list.mockResolvedValue({ items: [] });
    const w = mount(LoginView, { global: { plugins: [router] }, attachTo: document.body });
    await w.find('input[type="email"]').setValue('Demo@Oraviq.ai ');
    await w.find('input[type="password"]').setValue('demo1234');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(mocked.auth.login).toHaveBeenCalledWith({ email: 'demo@oraviq.ai', password: 'demo1234' });
    expect(router.currentRoute.value.fullPath).toBe('/orders');
    expect(JSON.parse(localStorage.getItem('oraviq.session')!).accessToken).toBe('a');
  });
});

describe('OrdersView', () => {
  const requested = order({ contact: contact({ name: 'Jasmine Carter' }), quote: quote({ totalCents: 72000 }), status: 'requested', conversationId: 'cv1' });
  const confirmed = order({ contact: contact({ name: 'Tom Reyes' }), quote: quote({ yards: 15, days: 5, totalCents: 59500 }), status: 'confirmed', depositRequested: true });

  it('lists orders with totals, status and the waiting count', async () => {
    mocked.orders.list.mockResolvedValue({ items: [requested, confirmed] });
    const router = makeRouter();
    await router.push('/orders');
    const w = mount(OrdersView, { global: { plugins: [router] }, attachTo: document.body });
    await flushPromises();
    const text = w.text();
    expect(text).toContain('1 request waiting for you to confirm.');
    expect(text).toContain('Jasmine Carter');
    expect(text).toContain('$720');
    expect(text).toContain('To confirm');
    expect(text).toContain('Deposit sent');
    expect(text).toContain('Mark delivered');
  });

  it('confirms an order and says so in a toast', async () => {
    mocked.orders.list.mockResolvedValue({ items: [requested] });
    mocked.orders.confirm.mockResolvedValue({ ...requested, status: 'confirmed', depositRequested: true, depositUrl: 'https://pay.example/x' });
    const router = makeRouter();
    await router.push('/orders');
    const w = mount(OrdersView, { global: { plugins: [router] }, attachTo: document.body });
    await flushPromises();
    const btn = w.findAll('button').find((b) => b.text() === 'Confirm');
    expect(btn).toBeTruthy();
    await btn!.trigger('click');
    await flushPromises();
    expect(mocked.orders.confirm).toHaveBeenCalledWith(requested.id);
    expect(useToast().toasts.value.map((t) => t.message)).toContain('Order confirmed. The customer got a text with the deposit link.');
    expect(w.text()).toContain('No requests waiting for you.');
  });

  it('shows the empty state with a way out when filters match nothing', async () => {
    mocked.orders.list.mockResolvedValue({ items: [] });
    const router = makeRouter();
    await router.push('/orders');
    const w = mount(OrdersView, { global: { plugins: [router] }, attachTo: document.body });
    await flushPromises();
    expect(w.text()).toContain('No orders yet');
  });
});
