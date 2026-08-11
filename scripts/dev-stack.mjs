/**
 * CommerceNest one-command dev stack.
 *
 * Starts embedded Postgres (if needed), pushes schema, seeds demo data,
 * then runs API + all frontends together with labeled output.
 *
 * Usage: npm run dev
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const EmbeddedPostgres = require('embedded-postgres').default;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function loadRootEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    const example = path.join(root, '.env.example');
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, envPath);
      console.log(`${colors.yellow}[setup] created .env from .env.example${colors.reset}`);
    }
  }
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function freePorts(ports) {
  if (process.platform !== 'win32') {
    for (const port of ports) {
      spawnSync('bash', ['-lc', `fuser -k ${port}/tcp 2>/dev/null || true`], {
        encoding: 'utf8',
      });
    }
    return;
  }
  const list = ports.join(',');
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `$ports = @(${list}); foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; $conns = netstat -ano | Select-String ":$p\\s+.*LISTENING"; foreach ($c in $conns) { $pid = ($c.ToString() -split '\\s+')[-1]; if ($pid -match '^\\d+$') { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } } }`,
    ],
    { encoding: 'utf8' },
  );
}

function portIsOpen(port, host = '127.0.0.1', timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

function tagStream(child, label, color) {
  const prefix = `${color}[${label}]${colors.reset} `;
  const buffer = { out: '', err: '' };
  const print = (key, data) => {
    buffer[key] += data.toString();
    const lines = buffer[key].split(/\r?\n/);
    buffer[key] = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(prefix + line + '\n');
    }
  };
  child.stdout?.on('data', (d) => print('out', d));
  child.stderr?.on('data', (d) => print('err', d));
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runOnce(command, args, label, color = colors.dim) {
  return new Promise((resolve) => {
    const child = run(command, args);
    tagStream(child, label, color);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function waitForPort(port, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (
      (await portIsOpen(port, '127.0.0.1')) ||
      (await portIsOpen(port, '::1'))
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

async function waitForPortFree(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const busy =
      (await portIsOpen(port, '127.0.0.1')) || (await portIsOpen(port, '::1'));
    if (!busy) return;
    freePorts([port]);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} stayed busy`);
}

async function startEmbeddedPg() {
  const dbDir = path.join(root, '.pg-dev-data');
  const port = Number(process.env.CN_DEV_PG_PORT || 5432);
  const user = process.env.POSTGRES_USER || 'commercenest';
  const password = process.env.POSTGRES_PASSWORD || 'commercenest';
  const database = process.env.POSTGRES_DB || 'commercenest';

  // If something already answers on 5432, reuse it.
  try {
    await waitForPort(port, 800);
    console.log(`${colors.dim}[db] Postgres already listening on :${port}${colors.reset}`);
    return null;
  } catch {
    // start embedded
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    user,
    password,
    port,
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  });

  const alreadyInit = fs.existsSync(path.join(dbDir, 'PG_VERSION'));
  if (!alreadyInit) {
    console.log(`${colors.dim}[db] initialising ${dbDir}${colors.reset}`);
    await pg.initialise();
  }

  try {
    await pg.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `${colors.yellow}[db] embedded start issue — will try existing server:${colors.reset}`,
      message || '(no details)',
    );
    try {
      await waitForPort(port, 5000);
      console.log(`${colors.dim}[db] using existing Postgres on :${port}${colors.reset}`);
      return null;
    } catch {
      throw new Error(
        `Could not start or reach Postgres on :${port}. ${message || ''}`.trim(),
      );
    }
  }

  try {
    await pg.createDatabase(database);
  } catch {
    // already exists
  }

  console.log(`${colors.green}[db] Postgres ready on localhost:${port}${colors.reset}`);
  return pg;
}

async function main() {
  loadRootEnv();

  console.log(`${colors.cyan}[setup] freeing app ports 4000/5173/5174/5175/5176/${process.env.GATEWAY_PORT || 8080}${colors.reset}`);
  for (const port of [4000, 5173, 5174, 5175, 5176, Number(process.env.GATEWAY_PORT || 8080)]) {
    try {
      await waitForPortFree(port, 20000);
    } catch {
      console.warn(
        `${colors.yellow}[setup] could not fully free :${port} — continuing${colors.reset}`,
      );
    }
  }

  // Gateway SPA mode: same-origin /api + subdomain tenancy (force empty bases)
  process.env.VITE_API_BASE_URL = '';
  process.env.VITE_STORE_SLUG = '';
  process.env.VITE_STORE_DASHBOARD_URL =
    process.env.VITE_STORE_DASHBOARD_URL ||
    `http://app.localhost:${process.env.GATEWAY_PORT || 8080}`;

  const pg = await startEmbeddedPg();

  console.log(`${colors.cyan}[setup] prisma db push${colors.reset}`);
  const pushCode = await runOnce('npm', ['run', 'db:push'], 'push', colors.cyan);
  if (pushCode !== 0) {
    console.error(`${colors.red}[setup] db:push failed — aborting${colors.reset}`);
    process.exit(pushCode);
  }

  console.log(`${colors.cyan}[setup] seed${colors.reset}`);
  const seedCode = await runOnce('npm', ['run', 'db:seed'], 'seed', colors.cyan);
  if (seedCode !== 0) {
    console.error(`${colors.red}[setup] db:seed failed — aborting${colors.reset}`);
    process.exit(seedCode);
  }

  const apps = [
    { label: 'api', color: colors.green, cmd: ['run', 'dev:api'] },
    { label: 'admin', color: colors.magenta, cmd: ['run', 'dev:admin'] },
    { label: 'dashboard', color: colors.blue, cmd: ['run', 'dev:dashboard'] },
    { label: 'storefront', color: colors.yellow, cmd: ['run', 'dev:storefront'] },
    { label: 'marketing', color: colors.cyan, cmd: ['run', 'dev:marketing'] },
    { label: 'gateway', color: colors.cyan, cmd: ['run', 'dev:gateway'] },
  ];

  const children = apps.map(({ label, color, cmd }) => {
    const child = run('npm', cmd);
    tagStream(child, label, color);
    return { child, label };
  });

  const gatewayPort = Number(process.env.GATEWAY_PORT || 8080);
  const ports = [
    ['api', 4000],
    ['admin', 5173],
    ['dashboard', 5174],
    ['storefront', 5175],
    ['marketing', 5176],
    ['gateway', gatewayPort],
  ];

  for (const [label, port] of ports) {
    try {
      await waitForPort(Number(port), 90000);
      console.log(`${colors.green}[stack] ${label} ready on :${port}${colors.reset}`);
    } catch {
      console.warn(
        `${colors.yellow}[stack] ${label} port ${port} not confirmed — check logs above${colors.reset}`,
      );
    }
  }

  console.log(
    `${colors.bright}\nCommerceNest ready — open ONE port${colors.reset}\n` +
      `  Marketing   http://localhost:${gatewayPort}\n` +
      `  Master      http://admin.localhost:${gatewayPort}   (admin@commercenest.com / Admin123!)\n` +
      `  Store Admin http://app.localhost:${gatewayPort}     (owner@techworld.bd / Owner123!)\n` +
      `  Storefront  http://techworld-bd.localhost:${gatewayPort}\n` +
      `${colors.dim}  (internal Vite/API ports stay private; use the gateway only)${colors.reset}\n`,
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${colors.dim}Shutting down…${colors.reset}`);
    for (const { child } of children) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
    freePorts([4000, 5173, 5174, 5175, 5176, gatewayPort]);
    if (pg) {
      try {
        await pg.stop();
      } catch {
        // ignore
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  for (const { child, label } of children) {
    child.on('exit', (code) => {
      if (!shuttingDown && code !== 0) {
        console.error(
          `${colors.red}[${label}] exited (code ${code}). Press Ctrl+C to stop all.${colors.reset}`,
        );
      }
    });
  }

  await new Promise(() => undefined);
}

main().catch((err) => {
  console.error(`${colors.red}[stack] failed:${colors.reset}`, err);
  process.exit(1);
});
