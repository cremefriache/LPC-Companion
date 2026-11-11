import { EXTENSION_DISPLAY_NAME, EXTENSION_VERSION } from '../catalog/release-info.mjs';

const VALID_LEVELS = new Set(['info', 'warn', 'error']);
const FORBIDDEN_KEYS = new Set([
    'content',
    'mes',
    'message',
    'messages',
    'prompt',
    'system_prompt',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
    'creator_notes',
    'chat',
    'json_data',
    'apiKey',
    'api_key',
    'token',
    'secret',
    'password',
    'authorization',
    'cookie',
    'headers',
]);

const CREDENTIAL_RE = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._~+/-]+=*|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*)/g;
const HOME_PATH_RE = /\/(?:home|Users)\/[^/\s"']+/g;
const LAN_IP_RE = /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;

export function redactDiagnosticString(raw, maxLength = 160) {
    const cleaned = String(raw ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(CREDENTIAL_RE, '[redacted-credential]')
        .replace(HOME_PATH_RE, match => `/${match.split('/')[1]}/[redacted]`)
        .replace(LAN_IP_RE, '[lan-ip]')
        .trim();
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

export function sanitizeDiagnosticValue(value, depth = 0) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
    if (typeof value === 'string') return redactDiagnosticString(value);
    if (value instanceof Error) return redactDiagnosticString(value.message || value.name || 'Error');
    if (depth >= 2) return '[truncated]';
    if (Array.isArray(value)) {
        return value.slice(0, 16).map(item => sanitizeDiagnosticValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        const out = {};
        let count = 0;
        for (const [key, entry] of Object.entries(value)) {
            if (FORBIDDEN_KEYS.has(key) || entry === undefined) continue;
            if (count >= 12) {
                out._more = true;
                break;
            }
            out[redactDiagnosticString(key, 48)] = sanitizeDiagnosticValue(entry, depth + 1);
            count++;
        }
        return out;
    }
    return redactDiagnosticString(String(value));
}

/**
 * Bounded, privacy-safe in-memory diagnostic ring buffer.
 * Never logs chat prose, character card text, prompts, or credentials.
 */
export function createDebugLog({
    maxEntries = 200,
    now = () => new Date().toISOString(),
    getSnapshot = null,
} = {}) {
    const capacity = Math.max(1, Math.min(500, Math.trunc(maxEntries) || 200));
    const buffer = [];
    const subscribers = new Set();
    let sequence = 0;

    function notify() {
        for (const listener of [...subscribers]) {
            try {
                listener();
            } catch { /* Subscriber errors must never disrupt extension work. */ }
        }
    }

    function record(level, category, event, detail = null) {
        const safeLevel = VALID_LEVELS.has(level) ? level : 'info';
        const safeCategory = redactDiagnosticString(category || 'general', 32) || 'general';
        const safeEvent = redactDiagnosticString(event || 'event', 64) || 'event';
        const safeDetail = detail && typeof detail === 'object' && !Array.isArray(detail)
            ? sanitizeDiagnosticValue(detail, 0)
            : detail != null ? { value: sanitizeDiagnosticValue(detail, 0) } : null;
        const entry = Object.freeze({
            seq: ++sequence,
            timestamp: String(now()),
            level: safeLevel,
            category: safeCategory,
            event: safeEvent,
            ...(safeDetail && Object.keys(safeDetail).length ? { detail: Object.freeze(safeDetail) } : {}),
        });
        if (buffer.length >= capacity) buffer.shift();
        buffer.push(entry);
        notify();
        return entry;
    }

    function clear() {
        if (!buffer.length) return;
        buffer.length = 0;
        notify();
    }

    function safeSnapshot() {
        if (typeof getSnapshot !== 'function') return null;
        try {
            const raw = getSnapshot();
            return raw && typeof raw === 'object' ? sanitizeDiagnosticValue(raw, 0) : null;
        } catch {
            return null;
        }
    }

    function buildReport() {
        return {
            schemaVersion: 1,
            kind: 'lpc-companion-diagnostic-log',
            extension: {
                name: EXTENSION_DISPLAY_NAME,
                version: EXTENSION_VERSION,
            },
            generatedAt: String(now()),
            privacy: 'Sanitized technical diagnostics only; excludes chat messages, character prose, and credentials.',
            snapshot: safeSnapshot(),
            entries: buffer.map(entry => ({
                ...entry,
                ...(entry.detail ? { detail: structuredClone(entry.detail) } : {}),
            })),
        };
    }

    function formatText() {
        const report = buildReport();
        const lines = [
            `${report.extension.name} v${report.extension.version} — Diagnostic Log`,
            `Generated: ${report.generatedAt}`,
        ];
        if (report.snapshot) {
            lines.push(`Snapshot: ${JSON.stringify(report.snapshot)}`);
        }
        lines.push('------------------------------------------------------------------------');
        if (!report.entries.length) {
            lines.push('(No diagnostic events recorded.)');
        } else {
            for (const entry of report.entries) {
                const timePart = entry.timestamp.includes('T')
                    ? entry.timestamp.split('T')[1].replace(/Z$/, '')
                    : entry.timestamp;
                const detailPart = entry.detail ? ` ${JSON.stringify(entry.detail)}` : '';
                lines.push(`[${timePart}] ${entry.level.toUpperCase().padEnd(5)} ${entry.category.padEnd(12)} ${entry.event}${detailPart}`);
            }
        }
        return lines.join('\n');
    }

    return Object.freeze({
        record,
        info: (category, event, detail) => record('info', category, event, detail),
        warn: (category, event, detail) => record('warn', category, event, detail),
        error: (category, event, detail) => record('error', category, event, detail),
        entries: () => buffer.slice(),
        size: () => buffer.length,
        clear,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            subscribers.add(listener);
            return () => subscribers.delete(listener);
        },
        buildReport,
        formatText,
    });
}
