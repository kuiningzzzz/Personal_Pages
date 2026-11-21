import './load-env.js';
import Database from './sqlite.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeAdminAuth } from './admin-auth.js';

const args = process.argv.slice(2);
if (args[0] !== '--all' && (args[0] !== '--ip' || !args[1])) {
    console.error('用法：node server/admin-unlock.js --all 或 --ip <IP>（仅服务器管理员执行）');
    process.exit(1);
}
const data = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), 'data');
const db = new Database(join(data, 'admin-security.sqlite'));
initializeAdminAuth(db);
db.transaction(() => {
    if (args[0] === '--all') db.exec('DELETE FROM failures; DELETE FROM bans');
    else {
        db.prepare('DELETE FROM failures WHERE ip=?').run(args[1]);
        db.prepare('DELETE FROM bans WHERE subject=?').run('ip:' + args[1]);
    }
})();
db.close();
console.log('已解除指定登录限制；未更改密码或密钥配置。');
