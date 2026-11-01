import { createRouter, createWebHistory, type RouteRecordRaw, type Router, type RouterHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    /** Reachable without signing in. */
    public?: boolean;
    /** Sidebar entry key (icon + count). */
    nav?: string;
  }
}

export const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: 'Sign in', public: true } },
  { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { title: 'Create your account', public: true } },
  {
    path: '/',
    component: () => import('@/components/AppShell.vue'),
    children: [
      { path: '', redirect: '/inbox' },
      { path: 'inbox/:id?', name: 'inbox', component: () => import('@/views/InboxView.vue'), meta: { title: 'Inbox', nav: 'inbox' } },
      { path: 'receptionist', name: 'receptionist', component: () => import('@/views/ReceptionistView.vue'), meta: { title: 'AI receptionist', nav: 'receptionist' } },
      { path: 'try', name: 'try', component: () => import('@/views/TryView.vue'), meta: { title: 'Try it out', nav: 'try' } },
      { path: 'orders', name: 'orders', component: () => import('@/views/OrdersView.vue'), meta: { title: 'Orders', nav: 'orders' } },
      { path: 'reviews', name: 'reviews', component: () => import('@/views/ReviewsView.vue'), meta: { title: 'Reviews', nav: 'reviews' } },
      { path: 'website', name: 'website', component: () => import('@/views/WebsiteView.vue'), meta: { title: 'Website & widgets', nav: 'website' } },
      { path: 'pricing', name: 'pricing', component: () => import('@/views/PricingView.vue'), meta: { title: 'Pricing rules', nav: 'pricing' } },
      { path: 'report', name: 'report', component: () => import('@/views/ReportView.vue'), meta: { title: 'Weekly report', nav: 'report' } },
      { path: 'setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { title: 'Setup', nav: 'setup' } },
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: 'Settings', nav: 'settings' } },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: 'Page not found' } },
    ],
  },
];

export function installGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    if (to.meta.public) {
      if (auth.isAuthenticated && (to.name === 'login' || to.name === 'register')) {
        const ok = await auth.ensureLoaded().catch(() => true);
        if (ok) return typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/inbox';
      }
      return true;
    }
    if (!auth.isAuthenticated) return { name: 'login', query: to.fullPath !== '/inbox' && to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
    try {
      const ok = await auth.ensureLoaded();
      if (!ok) return { name: 'login', query: { redirect: to.fullPath } };
    } catch {
      // Offline or the API is down: let the page render its own error state.
    }
    return true;
  });

  router.afterEach((to) => {
    if (typeof document !== 'undefined') document.title = to.meta.title ? `${to.meta.title} · Oraviq AI` : 'Oraviq AI';
  });
}

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes,
    scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  });
  installGuards(router);
  return router;
}
