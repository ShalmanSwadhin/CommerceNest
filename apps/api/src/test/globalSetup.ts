/**
 * Starts an embedded Postgres for integration tests, pushes schema, seeds data.
 * Skips gracefully if embedded-postgres binaries fail (e.g. unsupported arch).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');
const apiRoot = path.resolve(__dirname, '../..');
const dbDir = path.resolve(apiRoot, '.pg-test-data');
/** Unique port avoids Windows shared-memory collisions from crashed prior runs. */
const port = Number(process.env.CN_TEST_PG_PORT || 55441);

function wipeDbDir() {
  try {
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

/** Best-effort: free the test port from a previous crashed vitest run. */
function freeTestPort() {
  try {
    if (process.platform === 'win32') {
      const out = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ],
        { encoding: 'utf8' },
      );
      void out;
    } else {
      spawnSync('bash', ['-lc', `fuser -k ${port}/tcp 2>/dev/null || true`], {
        encoding: 'utf8',
      });
    }
  } catch {
    // ignore
  }
}

export async function setup() {
  if (process.env.DATABASE_URL && process.env.CN_SKIP_EMBEDDED_PG === '1') {
    return async () => undefined;
  }

  let EmbeddedPostgres: typeof import('embedded-postgres').default;
  try {
    ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  } catch (err) {
    console.warn('[vitest] embedded-postgres not available — DB tests will skip', err);
    return async () => undefined;
  }

  freeTestPort();
  wipeDbDir();

  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: 'postgres',
    password: 'password',
    port,
    persistent: false,
    onLog: () => undefined,
    onError: (msg) => {
      console.warn('[embedded-postgres]', msg);
    },
  });

  try {
    await pg.initialise();
    await pg.start();
    try {
      await pg.createDatabase('commercenest_test');
    } catch {
      // may already exist on reuse
    }

    const databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/commercenest_test?schema=public`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.CN_TEST_EMBEDDED_PG = '1';

    // migrate deploy (not db push) so every test run also validates that the
    // committed migration history actually produces a working schema.
    execSync('npx prisma migrate deploy', {
      cwd: path.join(root, 'packages/prisma'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    execSync('npx tsx src/seed.ts', {
      cwd: apiRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'development',
        SEED_ADMIN_EMAIL: 'admin@commercenest.com',
        SEED_ADMIN_PASSWORD: 'Admin123!',
      },
      stdio: 'inherit',
    });

    return async () => {
      try {
        await pg.stop();
      } catch {
        // ignore
      }
      freeTestPort();
      wipeDbDir();
    };
  } catch (err) {
    console.warn(
      '[vitest] Failed to start embedded Postgres — DB integration tests will skip:',
      err,
    );
    try {
      await pg.stop();
    } catch {
      // ignore
    }
    freeTestPort();
    wipeDbDir();
    return async () => undefined;
  }
}
