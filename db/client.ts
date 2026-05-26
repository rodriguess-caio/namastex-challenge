import DatabaseConstructor, { Database } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { initSchema } from './schema';

// Resolve data directory relative to project root (two levels up from db/)
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'db.sqlite');

// Ensure data/ directory exists before opening the database
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: Database = new DatabaseConstructor(dbPath);

// Initialize schema (creates tables + sets WAL mode) on first import
initSchema(db);

export { db };
