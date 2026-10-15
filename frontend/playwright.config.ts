import { defineConfig } from '@playwright/test';

// Phone-width regression suite. Needs the full stack up (see .claude/skills/run): npm run test:mobile
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: process.env['BASE_URL'] ?? 'http://localhost:4200' }
});
