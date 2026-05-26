import type { Database } from 'better-sqlite3';

export function initSchema(db: Database): void {
  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS monitored_repos (
      id         INTEGER PRIMARY KEY,
      owner      TEXT NOT NULL,
      repo       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(owner, repo)
    );

    CREATE TABLE IF NOT EXISTS notified_events (
      id              INTEGER PRIMARY KEY,
      event_type      TEXT NOT NULL,
      github_event_id TEXT NOT NULL,
      notified_at     TEXT DEFAULT (datetime('now')),
      UNIQUE(event_type, github_event_id)
    );
  `);
}
