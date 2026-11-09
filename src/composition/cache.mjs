/** Per-owner byte-bounded LRU. Pending work cannot repopulate a cleared cache. */
export class ImageCache {
    constructor(maxBytes = 8 * 1024 * 1024) { this.maxBytes = maxBytes; this.entries = new Map(); this.pending = new Map(); this.bytes = 0; this.epoch = 0; }
    async get(key, load) {
        const hit = this.entries.get(key);
        if (hit) { this.entries.delete(key); this.entries.set(key, hit); return hit.value; }
        if (this.pending.has(key)) return this.pending.get(key);
        if (this.pending.size >= 32) throw Error('Renderer is busy. Retry after the current images finish.');
        const promise = this.load(key, load);
        this.pending.set(key, promise);
        try { return await promise; } finally { if (this.pending.get(key) === promise) this.pending.delete(key); }
    }
    async load(key, load) {
        const epoch = this.epoch;
        const value = await load();
        const size = value.width * value.height * 4;
        if (epoch !== this.epoch || size > this.maxBytes) return value;
        // Concurrent requests may have filled this key while loading.
        if (this.entries.has(key)) return this.entries.get(key).value;
        while (this.bytes + size > this.maxBytes && this.entries.size) {
            const oldest = this.entries.keys().next().value;
            this.bytes -= this.entries.get(oldest).size;
            this.entries.delete(oldest);
        }
        this.entries.set(key, { value, size }); this.bytes += size;
        return value;
    }
    clear() { this.epoch++; this.entries.clear(); this.pending.clear(); this.bytes = 0; }
}
