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
    db.exec(`CREATE TABLE IF NOT EXISTS home_playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0
    )`);
    if (!db.prepare('PRAGMA table_info(home_tracks)').all().some(column => column.name === 'playlist_id')) {
        db.exec('ALTER TABLE home_tracks ADD COLUMN playlist_id INTEGER REFERENCES home_playlists(id) ON DELETE CASCADE');
    }
    if (db.prepare('SELECT 1 FROM home_tracks WHERE playlist_id IS NULL LIMIT 1').get()) {
        const playlist = db.prepare('SELECT id FROM home_playlists ORDER BY display_order,id LIMIT 1').get();
        const id = playlist?.id ?? db.prepare('INSERT INTO home_playlists(title) VALUES(?)').run('我的歌单').lastInsertRowid;
        db.prepare('UPDATE home_tracks SET playlist_id=? WHERE playlist_id IS NULL').run(id);
    }
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

export function homePlaylists(db) {
    const tracks = db.prepare('SELECT id,title,artist,url,playlist_id FROM home_tracks ORDER BY display_order,id').all();
    return db.prepare('SELECT id,title FROM home_playlists ORDER BY display_order,id').all().map(playlist => ({
        ...playlist, tracks: tracks.filter(track => track.playlist_id === playlist.id).map(({ playlist_id, ...track }) => track),
    }));
}
export const homePlaylist = db => homePlaylists(db)[0]?.tracks || [];

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
    const playlists = homePlaylists(db);
    if (!playlists.length && tracks.length) playlists.push({ title: '我的歌单', tracks: [] });
    if (playlists.length) playlists[0].tracks = tracks;
    savePlaylists(db, playlists);
}

export function validatePlaylists(playlists) {
    if (!Array.isArray(playlists) || playlists.length > 20) return '最多设置 20 个歌单';
    const playlistIds = new Set(), trackIds = new Set();
    for (const playlist of playlists) {
        if (!playlist || typeof playlist.title !== 'string' || !playlist.title.trim() || playlist.title.length > 120) return '请填写歌单名称，最多 120 字';
        const error = validatePlaylist(playlist.tracks);
        if (error) return error;
        const id = Number(playlist.id);
        if (Number.isSafeInteger(id) && id > 0) {
            if (playlistIds.has(id)) return '存在重复的歌单编号';
            playlistIds.add(id);
        }
        for (const track of playlist.tracks) {
            const trackId = Number(track.id);
            if (Number.isSafeInteger(trackId) && trackId > 0) {
                if (trackIds.has(trackId)) return '多个歌单中存在重复的歌曲编号';
                trackIds.add(trackId);
            }
        }
    }
    return null;
}

// Caller owns the transaction so the homepage and its music library save together.
export function savePlaylists(db, playlists) {
    const previousLists = new Set(db.prepare('SELECT id FROM home_playlists').all().map(row => row.id));
    const previousTracks = new Set(db.prepare('SELECT id FROM home_tracks').all().map(row => row.id));
    db.prepare('DELETE FROM home_tracks').run();
    db.prepare('DELETE FROM home_playlists').run();
    const insertList = db.prepare('INSERT INTO home_playlists(id,title,display_order) VALUES(?,?,?)');
    const insertTrack = db.prepare('INSERT INTO home_tracks(id,title,artist,url,display_order,playlist_id) VALUES(?,?,?,?,?,?)');
    playlists.forEach((playlist, order) => {
        const playlistId = insertList.run(previousLists.has(Number(playlist.id)) ? Number(playlist.id) : null,
            playlist.title.trim(), order).lastInsertRowid;
        playlist.tracks.forEach((track, index) => insertTrack.run(previousTracks.has(Number(track.id)) ? Number(track.id) : null,
            String(track.title).trim(), String(track.artist || '').trim(), String(track.url), index, playlistId));
    });
}
