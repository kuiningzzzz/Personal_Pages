// Shared by the API and admin UI. Limits still apply to authenticated imports.
export const BACKUP_LIMITS = Object.freeze({
    uploadBytes: 16 * 1024 ** 3,
    expandedBytes: 128 * 1024 ** 3,
    files: 500000,
    entries: 1000000,
    directories: 500000,
    manifestBytes: 128 * 1024 ** 2,
    databaseBytes: 512 * 1024 ** 2
});
