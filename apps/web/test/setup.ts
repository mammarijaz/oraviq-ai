import { afterEach } from 'vitest';
import { sessionTokens } from '@/api/session';

afterEach(() => {
  localStorage.clear();
  sessionTokens.reset();
});
