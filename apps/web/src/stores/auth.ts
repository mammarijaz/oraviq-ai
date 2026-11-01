import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AuthResponse, LoginRequest, RegisterRequest, TenantDto, UserDto } from '@oraviq/shared';
import { api, setSessionExpiredHandler } from '@/api';
import { sessionTokens } from '@/api/session';

/** The signed-in user, their tenant (business) and the token pair. */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDto | null>(null);
  const tenant = ref<TenantDto | null>(null);
  const accessToken = ref<string | null>(sessionTokens.get()?.accessToken ?? null);
  /** Set when the refresh token was rejected; the router sends the user to /login. */
  const expired = ref(false);
  let loading: Promise<boolean> | null = null;

  sessionTokens.subscribe((t) => {
    accessToken.value = t?.accessToken ?? null;
  });

  const isAuthenticated = computed(() => !!accessToken.value);

  function applyAuth(r: AuthResponse) {
    sessionTokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn });
    user.value = r.user;
    tenant.value = r.tenant;
    expired.value = false;
  }

  async function login(body: LoginRequest) {
    applyAuth(await api.auth.login(body));
  }

  async function register(body: RegisterRequest) {
    applyAuth(await api.auth.register(body));
  }

  /** Loads /auth/me once per session (refreshing the token if needed). Returns false when signed out. */
  function ensureLoaded(): Promise<boolean> {
    if (!isAuthenticated.value) return Promise.resolve(false);
    if (user.value && tenant.value) return Promise.resolve(true);
    if (!loading) {
      loading = api.auth
        .me()
        .then((r) => {
          user.value = r.user;
          tenant.value = r.tenant;
          return true;
        })
        .catch((e) => {
          if ((e as { status?: number }).status === 401) {
            clear();
            return false;
          }
          throw e;
        })
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  }

  function setTenant(t: TenantDto) {
    tenant.value = t;
  }

  function clear() {
    sessionTokens.set(null);
    user.value = null;
    tenant.value = null;
  }

  function logout() {
    clear();
    expired.value = false;
  }

  setSessionExpiredHandler(() => {
    user.value = null;
    tenant.value = null;
    expired.value = true;
  });

  return { user, tenant, accessToken, expired, isAuthenticated, login, register, ensureLoaded, setTenant, logout };
});
