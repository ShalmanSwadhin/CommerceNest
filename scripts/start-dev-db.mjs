/**
 * Start a local embedded Postgres for CommerceNest development (no Docker required).
 * Keeps running until Ctrl+C.
 *
 * Credentials match .env.example:
 *   postgresql://commercenest:commercenest@localhost:5432/commercenest
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const EmbeddedPostgres = require('embedded-postgres').default;

const dbDir = path.join(root, '.pg-dev-data');
const port = Number(process.env.CN_DEV_PG_PORT || 5432);
const user = process.env.POSTGRES_USER || 'commercenest';
const password = process.env.POSTGRES_PASSWORD || 'commercenest';
const database = process.env.POSTGRES_DB || 'commercenest';

function freePort(p) {
  if (process.platform !== 'win32') return;
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -LocalPort ${p} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ],
    { encoding: 'utf8' },
  );
}

const pg = new EmbeddedPostgres({
  databaseDir: dbDir,
  user,
  password,
  port,
  persistent: true,
  onLog: (msg) => process.stdout.write(String(msg)),
  onError: (msg) => console.error('[dev-db]', msg),
});

async function main() {
  freePort(port);

  const alreadyInit = fs.existsSync(path.join(dbDir, 'PG_VERSION'));
  if (!alreadyInit) {
    console.log(`[dev-db] Initialising data directory at ${dbDir}`);
    await pg.initialise();
  }

  console.log(`[dev-db] Starting Postgres on localhost:${port}…`);
  await pg.start();

  try {
    await pg.createDatabase(database);
    console.log(`[dev-db] Database "${database}" ready`);
  } catch {
    console.log(`[dev-db] Database "${database}" already exists`);
  }

  console.log(
    `[dev-db] DATABASE_URL=postgresql://${user}:${password}@localhost:${port}/${database}?schema=public`,
  );
  console.log(
    '[dev-db] Leave this terminal open. In another terminal run: npm run db:push && npm run db:seed',
  );

  const shutdown = async () => {
    console.log('\n[dev-db] Stopping…');
    try {
      await pg.stop();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[dev-db] Failed to start:', err);
  process.exit(1);
});
