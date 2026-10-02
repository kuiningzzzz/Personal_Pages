export function migrateHomeMusic(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS home_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS home_welcome (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        line_1 TEXT NOT NULL, line_2 TEXT NOT NULL, line_3 TEXT NOT NULL
    )`);
    db.prepare('INSERT OR IGNORE INTO home_welcome(id,line_1,line_2,line_3) VALUES(1,?,?,?)').run(
        '很高兴在这里遇见你。', '放一张唱片，慢慢逛逛。', '一些日常，一些想法，还有喜欢的东西。');
}

export function homeWelcome(db) {
    const row = db.prepare('SELECT line_1,line_2,line_3 FROM home_welcome WHERE id=1').get();
    return [row.line_1, row.line_2, row.line_3];
}
export function validateWelcome(lines) {
    return !Array.isArray(lines) || lines.length !== 3 || lines.some(line => typeof line !== 'string' ||
        !line.trim() || [...line.trim()].length > 120 || /[\r\n]/.test(line)) ? '请填写三行欢迎文字，每行最多 120 字，不包含换行' : null;
}
export function saveWelcome(db, lines) {
    db.prepare('UPDATE home_welcome SET line_1=?,line_2=?,line_3=? WHERE id=1').run(...lines.map(line => line.trim()));
}

export const homePlaylist = db => db.prepare('SELECT id,title,artist,url FROM home_tracks ORDER BY display_order,id').all();

export function validatePlaylist(value) {
    if (!Array.isArray(value) || value.length > 100) return '歌单最多 100 首歌曲';
    if (value.some(track => !track || !String(track.title || '').trim() || String(track.title).length > 120 ||
        String(track.artist || '').length > 120 || !/^\/source\/[a-z\d_.-]+\.mp3$/i.test(String(track.url || '')))) {
        return '请填写歌曲名称，并使用上传到本站的 MP3 文件';
    }
    const ids = value.map(track => Number(track.id)).filter(id => Number.isSafeInteger(id) && id > 0);
    if (new Set(ids).size !== ids.length) return '歌单中存在重复的歌曲编号';
    return null;
}

export function savePlaylist(db, tracks) {
    const previous = new Set(homePlaylist(db).map(track => track.id));
    db.prepare('DELETE FROM home_tracks').run();
    const insert = db.prepare('INSERT INTO home_tracks(id,title,artist,url,display_order) VALUES(?,?,?,?,?)');
    tracks.forEach((track, index) => insert.run(previous.has(Number(track.id)) ? Number(track.id) : null,
        String(track.title).trim(), String(track.artist || '').trim(), String(track.url), index));
}
