export function migrateHomeSentences(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS home_sentences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0
    )`);
}

export const homeSentences = db => db.prepare('SELECT id,content FROM home_sentences ORDER BY display_order,id').all();

export function validateSentences(sentences) {
    if (!Array.isArray(sentences) || sentences.length > 500) return '首页句子最多保存 500 条';
    if (sentences.some(sentence => !sentence || typeof sentence.content !== 'string' || !sentence.content.trim() || [...sentence.content.trim()].length > 2000)) {
        return '句子内容不能为空，每条最多 2000 字';
    }
    const ids = sentences.map(sentence => Number(sentence.id)).filter(id => Number.isSafeInteger(id) && id > 0);
    return new Set(ids).size !== ids.length ? '存在重复的句子编号' : null;
}

// Saved in the homepage transaction, and included by the database backup automatically.
export function saveSentences(db, sentences) {
    const previous = new Set(homeSentences(db).map(sentence => sentence.id));
    db.prepare('DELETE FROM home_sentences').run();
    const insert = db.prepare('INSERT INTO home_sentences(id,content,display_order) VALUES(?,?,?)');
    sentences.forEach((sentence, index) => insert.run(previous.has(Number(sentence.id)) ? Number(sentence.id) : null, sentence.content.trim(), index));
}
