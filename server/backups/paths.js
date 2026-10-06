import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function runtimePaths(dataRoot, publicRoot) {
    const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'), projectRoot = dirname(serverRoot);
    return Object.fromEntries(Object.entries({ dataRoot: resolve(dataRoot), publicRoot: resolve(publicRoot), serverRoot, projectRoot }).flatMap(([key, value]) => [[key, value], [`${key}Url`, pathToFileURL(value).href]]));
}
export function relocatePaths(source, target) {
    const pairs = [];
    for (const key of Object.keys(target)) if (typeof source?.[key] === 'string' && source[key].length > 1) {
        const from = source[key], to = target[key];
        pairs.push([from, to], [from.replaceAll('\\', '/'), to.replaceAll('\\', '/')], [JSON.stringify(from).slice(1, -1), JSON.stringify(to).slice(1, -1)]);
    }
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rules = [...new Map(pairs.filter(([a, b]) => a !== b)).entries()].sort((a, b) => b[0].length - a[0].length);
    const pattern = rules.length ? new RegExp(rules.map(([from]) => `(${escape(from)}(?=[/\\\\"\\s]|$))`).join('|'), 'g') : null;
    function plain(value) {
        // Standalone paths may contain spaces. Convert the entire suffix using
        // the target platform's separator, not just the old root prefix.
        const rule = rules.find(([from]) => value === from || value.startsWith(from + '/') || value.startsWith(from + '\\'));
        if (rule) return rule[1] + value.slice(rule[0].length).replace(/[\\/]+/g, rule[1].includes('\\') ? '\\' : '/');
        return value.replace(pattern, (...match) => rules[match.slice(1, 1 + rules.length).findIndex(value => value !== undefined)][1]);
    }
    function relocate(value, depth = 0) {
        if (!pattern || typeof value !== 'string') return value;
        if (depth < 50 && /^[\s]*[\[{]/.test(value)) {
            try {
                const parsed = JSON.parse(value);
                let changed = false;
                const visit = data => {
                    if (typeof data === 'string') { const next = relocate(data, depth + 1); changed ||= next !== data; return next; }
                    if (Array.isArray(data)) return data.map(visit);
                    if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).map(([key, item]) => [key, visit(item)]));
                    return data;
                };
                const next = visit(parsed); return changed ? JSON.stringify(next) : value;
            } catch { /* Markdown and JSONL can contain individual paths. */ }
        }
        if (value.includes('\n')) return value.split('\n').map(line => relocate(line, depth + 1)).join('\n');
        return plain(value);
    }
    return relocate;
}
