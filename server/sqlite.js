import { DatabaseSync } from 'node:sqlite';

// Keep the small database interface used by the existing routes and migrations.
// The database files remain ordinary SQLite files; no native npm addon is needed.
export default class Database {
    #connection;

    constructor(path) {
        this.#connection = new DatabaseSync(path);
    }

    exec(sql) {
        return this.#connection.exec(sql);
    }

    prepare(sql) {
        return this.#connection.prepare(sql);
    }

    pragma(sql) {
        if (sql.includes('=')) return this.exec(`PRAGMA ${sql}`);
        return this.prepare(`PRAGMA ${sql}`).all();
    }

    transaction(callback) {
        return (...args) => {
            this.exec('BEGIN');
            try {
                const result = callback(...args);
                this.exec('COMMIT');
                return result;
            } catch (error) {
                if (this.#connection.isTransaction) this.exec('ROLLBACK');
                throw error;
            }
        };
    }

    close() {
        this.#connection.close();
    }
}
