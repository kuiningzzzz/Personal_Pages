// Backups pause background writers and reject new mutations while taking a snapshot.
let locked = false;
let inFlight = 0;
let drained;
let hooks = { pause: async () => {}, resume: () => {} };
export const maintenanceActive = () => locked;
export function configureMaintenance(value) { hooks = value; }
export async function withMaintenance(work) {
    if (locked) throw new Error('另一个备份或还原任务正在进行');
    locked = true;
    try { await hooks.pause(); if (inFlight) await new Promise(resolve => { drained = resolve; }); return await work(); }
    finally { locked = false; hooks.resume(); }
}
export function maintenanceMiddleware(req, res, next) {
    if (req.path.startsWith('/api/admin/backups')) return next();
    if (locked)
        return res.status(503).json({ success: false, message: '备份或还原进行中，请稍后再试' });
    inFlight++;
    let finished = false;
    const done = () => { if (finished) return; finished = true; inFlight--; if (!inFlight && drained) { const resolve = drained; drained = null; resolve(); } };
    res.once('finish', done); res.once('close', done);
    next();
}
