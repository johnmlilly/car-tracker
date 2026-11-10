import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPlatformProxy } from 'wrangler'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations')

function migrationStatements(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8').split('--> statement-breakpoint'))
    .map((sql) =>
      sql
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean)
}

/**
 * Local Miniflare D1 + R2 bindings from wrangler.jsonc, in memory, with every
 * migration applied. Call `dispose` when done.
 */
export async function startPlatform() {
  const proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false })
  const db = proxy.env.DB
  await db.batch(migrationStatements().map((sql) => db.prepare(sql)))
  return { env: proxy.env, dispose: () => proxy.dispose() }
}
