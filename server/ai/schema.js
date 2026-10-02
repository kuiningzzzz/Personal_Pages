import { INITIAL_BUDGET } from './budget.js';

export function migrateAi(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ai_tasks (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, prompt TEXT NOT NULL, links TEXT NOT NULL DEFAULT '[]',
            collection_id INTEGER NOT NULL, settings TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
            iterations INTEGER NOT NULL DEFAULT 0, budget INTEGER NOT NULL DEFAULT ${INITIAL_BUDGET},
            draft TEXT NOT NULL DEFAULT '{}', result_entry_id INTEGER, error TEXT NOT NULL DEFAULT '',
            usage TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_task_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
            url TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'input'
        );
        CREATE TABLE IF NOT EXISTS ai_task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
            kind TEXT NOT NULL, message TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_events_task ON ai_task_events(task_id, id);
    `);
    db.prepare("UPDATE ai_tasks SET budget=? WHERE status='queued' AND iterations=0 AND budget<?").run(INITIAL_BUDGET, INITIAL_BUDGET);
    db.prepare('INSERT OR IGNORE INTO site_configs (key, data) VALUES (?, ?)').run('ai_learning', JSON.stringify({
        reportInstructions: '', maxOutputTokens: 16384, taskTimeoutMinutes: 30
    }));
}
