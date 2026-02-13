/**
 * Test setup helpers.
 * Use DATABASE_URL or TEST_DATABASE_URL for integration tests that need a DB.
 */
export function getTestDatabaseUrl(): string | undefined {
  return (
    process.env.TEST_DATABASE_URL ||
    (process.env.CI ? undefined : process.env.DATABASE_URL)
  );
}
