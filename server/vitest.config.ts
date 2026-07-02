import { defineConfig } from 'vitest/config';

// Use an in-memory SQLite DB during tests so nothing touches server/data.
export default defineConfig({
  test: {
    env: { GARA_DB_PATH: ':memory:', DOCTOR_REGISTRATION_TOKEN: 'test-token' },
  },
});
