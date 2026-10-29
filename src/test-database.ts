// Test-only SQLite adapter. Production persistence is provided by the host SDK.
import { DatabaseSync } from 'node:sqlite';
export function createSqliteDatabase(path: string) {
  const db = new DatabaseSync(path);
  return { exec: (sql: string) => db.exec(sql), prepare: (sql: string) => db.prepare(sql), close: () => db.close(),
    transaction: <T>(fn: () => T) => () => { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
}
