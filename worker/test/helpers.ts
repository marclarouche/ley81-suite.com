// A D1-shaped wrapper over node:sqlite so repo code is tested against real SQL.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Db, D1Statement, D1Result } from '../src/repo.ts';

type Sql = string | number | null | bigint;
const norm = (v: unknown): Sql => (v === undefined ? null : (v as Sql));

class Stmt implements D1Statement {
  private values: Sql[] = [];
  private db: DatabaseSync;
  private sql: string;
  constructor(db: DatabaseSync, sql: string) { this.db = db; this.sql = sql; }
  bind(...v: unknown[]) { this.values = v.map(norm); return this; }
  // D1 supports numbered placeholders (?1); node:sqlite does not, so they are
  // translated to named ones (:p1) here. Production code keeps the D1 form.
  private prepared() {
    const sql = this.sql.replace(/\?(\d+)/g, ':p$1');
    const named: Record<string, Sql> = {};
    this.values.forEach((v, i) => { named['p' + (i + 1)] = v; });
    return { stmt: this.db.prepare(sql), named };
  }
  async first<T>() { const { stmt, named } = this.prepared(); return ((stmt.get(named) as T | undefined) ?? null); }
  async all<T>() { const { stmt, named } = this.prepared(); return { results: stmt.all(named) as T[], meta: {} } as D1Result<T>; }
  async run() { const { stmt, named } = this.prepared(); const r = stmt.run(named); return { results: [], meta: { changes: Number(r.changes) } } as D1Result; }
}

export function makeTestDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  return {
    raw,
    prepare: (sql) => new Stmt(raw, sql),
    async batch(stmts) {
      raw.exec('BEGIN');
      try { const out: D1Result[] = []; for (const s of stmts) out.push(await s.run()); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}
