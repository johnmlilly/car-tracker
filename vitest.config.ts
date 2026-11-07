import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so unit tests run in plain Node without the
// Cloudflare dev plugin starting a Worker runtime.
export default defineConfig({
  test: {
    include: ['{src,worker,shared}/**/*.test.{ts,tsx}'],
  },
})
