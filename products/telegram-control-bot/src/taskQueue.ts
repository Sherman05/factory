import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { type TaskState, validTransition } from './taskStates.ts';

export interface Task {
  id: number;
  desc: string;
  state: TaskState;
  createdBy: number;
  createdAt: number;
  prUrl?: string;
  error?: string;
}

export interface UpdatePatch {
  state?: TaskState;
  prUrl?: string;
  error?: string;
}

export interface TaskQueue {
  enqueue(desc: string, createdBy: number): Task;
  claim(): Task | null;
  update(id: number, patch: UpdatePatch): void;
  getById(id: number): Task | null;
  getActive(): Task[];
  getRecent(limit?: number): Task[];
  close(): void;
}

interface Row {
  id: number;
  desc: string;
  state: TaskState;
  created_by: number;
  created_at: number;
  pr_url: string | null;
  error: string | null;
}

function rowToTask(r: Row): Task {
  const t: Task = {
    id: r.id,
    desc: r.desc,
    state: r.state,
    createdBy: r.created_by,
    createdAt: r.created_at
  };
  if (r.pr_url !== null) t.prUrl = r.pr_url;
  if (r.error !== null) t.error = r.error;
  return t;
}

export function createTaskQueue(dbPath: string): TaskQueue {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      desc TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('queued','running','done','failed')),
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      pr_url TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
  `);

  const insertStmt = db.prepare(
    `INSERT INTO tasks (desc, state, created_by, created_at) VALUES (?, 'queued', ?, ?)`
  );
  const nextQueuedStmt = db.prepare(
    `SELECT * FROM tasks WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1`
  );
  const markRunningStmt = db.prepare(`UPDATE tasks SET state = 'running' WHERE id = ?`);
  const getByIdStmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const updateStateStmt = db.prepare(
    `UPDATE tasks SET state = ?, pr_url = COALESCE(?, pr_url), error = COALESCE(?, error) WHERE id = ?`
  );
  const activeStmt = db.prepare(
    `SELECT * FROM tasks WHERE state IN ('queued','running') ORDER BY created_at ASC`
  );
  const recentStmt = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?`);

  return {
    enqueue(desc, createdBy) {
      const createdAt = Date.now();
      const info = insertStmt.run(desc, createdBy, createdAt);
      return {
        id: Number(info.lastInsertRowid),
        desc,
        state: 'queued',
        createdBy,
        createdAt
      };
    },

    claim() {
      const claim = db.transaction((): Task | null => {
        const row = nextQueuedStmt.get() as Row | undefined;
        if (!row) return null;
        markRunningStmt.run(row.id);
        const updated = getByIdStmt.get(row.id) as Row;
        return rowToTask(updated);
      });
      return claim();
    },

    update(id, patch) {
      const row = getByIdStmt.get(id) as Row | undefined;
      if (!row) throw new Error(`task #${id} not found`);
      if (patch.state !== undefined) {
        if (!validTransition(row.state, patch.state)) {
          throw new Error(`invalid transition: ${row.state} → ${patch.state}`);
        }
      }
      const nextState = patch.state ?? row.state;
      updateStateStmt.run(nextState, patch.prUrl ?? null, patch.error ?? null, id);
    },

    getById(id) {
      const row = getByIdStmt.get(id) as Row | undefined;
      return row ? rowToTask(row) : null;
    },

    getActive() {
      return (activeStmt.all() as Row[]).map(rowToTask);
    },

    getRecent(limit = 10) {
      return (recentStmt.all(limit) as Row[]).map(rowToTask);
    },

    close() {
      db.close();
    }
  };
}
