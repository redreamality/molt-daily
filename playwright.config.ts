import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:8765',
  },
  webServer: {
    command: 'pnpm preview --port 8765 --host 0.0.0.0',
    url: 'http://localhost:8765/molt-daily',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
