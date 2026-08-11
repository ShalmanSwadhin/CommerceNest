/**
 * Vitest setup for CommerceNest API.
 * DATABASE_URL may be injected by globalSetup (embedded Postgres).
 */
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'test' : process.env.NODE_ENV || 'test';
if (process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'test';
}
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters!';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.CORS_ORIGINS =
  process.env.CORS_ORIGINS ??
  'http://localhost:5173,http://localhost:5174,http://localhost:5175';

export const hasDatabase = Boolean(process.env.DATABASE_URL);

if (!hasDatabase) {
  console.warn(
    '[vitest] DATABASE_URL not set — integration tests that need Postgres will skip.',
  );
}
