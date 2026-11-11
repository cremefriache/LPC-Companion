/** Bounded FIFO async semaphore with AbortSignal cancellation and waiter cap. */
export function createAsyncSemaphore({
    concurrency = 4,
    maxWaiters = 256,
    busyMessage = 'Resource is busy. Retry after current loads finish.',
    cancelMessage = 'Operation was cancelled.',
    closedMessage = 'Resource is closed.',
} = {}) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(maxWaiters) || maxWaiters < 0) {
        throw Error('Invalid async semaphore bounds.');
    }
    let active = 0;
    let closed = false;
    const queue = [];

    function makeRelease() {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            active--;
            pump();
        };
    }

    function pump() {
        while (!closed && active < concurrency && queue.length > 0) {
            const waiter = queue.shift();
            if (waiter.done) continue;
            waiter.done = true;
            waiter.cleanup();
            active++;
            waiter.resolve(makeRelease());
        }
    }

    function canAccept() {
        return !closed && (active < concurrency || queue.length < maxWaiters);
    }

    function tryAcquire() {
        if (!closed && active < concurrency && queue.length === 0) {
            active++;
            return makeRelease();
        }
        return null;
    }

    function acquire({ signal } = {}) {
        if (closed) return Promise.reject(Error(closedMessage));
        if (signal?.aborted) return Promise.reject(Error(cancelMessage));
        const immediate = tryAcquire();
        if (immediate) return Promise.resolve(immediate);
        if (queue.length >= maxWaiters) {
            return Promise.reject(Error(busyMessage));
        }
        return new Promise((resolve, reject) => {
            const waiter = { done: false, resolve, reject, cleanup: () => {} };
            if (signal) {
                const onAbort = () => {
                    if (waiter.done) return;
                    waiter.done = true;
                    const idx = queue.indexOf(waiter);
                    if (idx >= 0) queue.splice(idx, 1);
                    waiter.cleanup();
                    reject(Error(cancelMessage));
                };
                waiter.cleanup = () => signal.removeEventListener('abort', onAbort);
                signal.addEventListener('abort', onAbort, { once: true });
            }
            queue.push(waiter);
        });
    }

    function drainQueued(error = Error(closedMessage)) {
        while (queue.length > 0) {
            const waiter = queue.shift();
            if (waiter.done) continue;
            waiter.done = true;
            waiter.cleanup();
            waiter.reject(error);
        }
    }

    function dispose(error = Error(closedMessage)) {
        closed = true;
        drainQueued(error);
    }

    return Object.freeze({
        canAccept,
        tryAcquire,
        acquire,
        drainQueued,
        dispose,
        stats: () => ({ active, queued: queue.length, concurrency, maxWaiters, closed }),
    });
}

/** Keyed coalescing loader backed by a bounded FIFO semaphore and per-caller AbortSignal tracking. */
export function createCoalescedQueue(options = {}) {
    const {
        busyMessage = 'Resource is busy. Retry after current loads finish.',
        cancelMessage = 'Operation was cancelled.',
        closedMessage = 'Resource is closed.',
    } = options;
    const semaphore = createAsyncSemaphore(options);
    const pending = new Map();
    const allEntries = new Set();
    let closed = false;

    function execute(key, workFn, { signal } = {}) {
        if (closed) return Promise.reject(Error(closedMessage));
        if (signal?.aborted) return Promise.reject(Error(cancelMessage));

        let entry = pending.get(key);
        let created = false;
        if (!entry) {
            if (!semaphore.canAccept()) return Promise.reject(Error(busyMessage));
            entry = {
                key,
                started: false,
                settled: false,
                subscribers: new Set(),
                controller: new AbortController(),
            };
            pending.set(key, entry);
            allEntries.add(entry);
            created = true;
        }

        const callerPromise = new Promise((resolve, reject) => {
            const sub = {
                done: false,
                cleanup: () => {},
                resolve(value) {
                    if (sub.done) return;
                    sub.done = true;
                    sub.cleanup();
                    resolve(value);
                },
                reject(error) {
                    if (sub.done) return;
                    sub.done = true;
                    sub.cleanup();
                    reject(error);
                },
            };
            if (signal) {
                const onAbort = () => {
                    if (sub.done) return;
                    entry.subscribers.delete(sub);
                    sub.reject(Error(cancelMessage));
                    if (entry.subscribers.size === 0 && !entry.settled) {
                        if (pending.get(key) === entry) pending.delete(key);
                        entry.controller.abort();
                    }
                };
                sub.cleanup = () => signal.removeEventListener('abort', onAbort);
                signal.addEventListener('abort', onAbort, { once: true });
            }
            entry.subscribers.add(sub);
        });

        if (created) {
            const immediateRelease = semaphore.tryAcquire();
            (async () => {
                let release = immediateRelease;
                try {
                    if (!release) {
                        release = await semaphore.acquire({ signal: entry.controller.signal });
                    }
                    if (closed) throw Error(closedMessage);
                    if (entry.controller.signal.aborted) throw Error(cancelMessage);
                    entry.started = true;
                    const value = await workFn(entry.controller.signal);
                    if (closed) throw Error(closedMessage);
                    if (entry.controller.signal.aborted && entry.subscribers.size === 0) throw Error(cancelMessage);
                    entry.settled = true;
                    if (pending.get(key) === entry) pending.delete(key);
                    allEntries.delete(entry);
                    for (const sub of [...entry.subscribers]) {
                        entry.subscribers.delete(sub);
                        sub.resolve(value);
                    }
                } catch (error) {
                    entry.settled = true;
                    if (pending.get(key) === entry) pending.delete(key);
                    allEntries.delete(entry);
                    const finalError = closed ? Error(closedMessage) : error;
                    for (const sub of [...entry.subscribers]) {
                        entry.subscribers.delete(sub);
                        sub.reject(finalError);
                    }
                } finally {
                    release?.();
                }
            })();
        }

        return callerPromise;
    }

    function detachPending() {
        pending.clear();
    }

    function dispose() {
        closed = true;
        pending.clear();
        const error = Error(closedMessage);
        semaphore.dispose(error);
        for (const entry of [...allEntries]) {
            allEntries.delete(entry);
            entry.settled = true;
            entry.controller.abort();
            for (const sub of [...entry.subscribers]) {
                entry.subscribers.delete(sub);
                sub.reject(error);
            }
        }
    }

    return Object.freeze({
        pending,
        execute,
        detachPending,
        dispose,
        stats: () => ({ pending: pending.size, ...semaphore.stats() }),
    });
}

/** Per-owner byte-bounded LRU. Pending work queues behind a bounded FIFO semaphore and cannot repopulate a cleared cache. */
export class ImageCache {
    constructor(maxBytes = 8 * 1024 * 1024, {
        maxConcurrentLoads = 32,
        maxWaiters = 512,
        cancelMessage = 'Composition was cancelled.',
        closedMessage = 'Renderer is closed.',
    } = {}) {
        this.maxBytes = maxBytes;
        this.cancelMessage = cancelMessage;
        this.closedMessage = closedMessage;
        this.entries = new Map();
        this.bytes = 0;
        this.epoch = 0;
        this.queue = createCoalescedQueue({
            concurrency: maxConcurrentLoads,
            maxWaiters,
            busyMessage: 'Renderer is busy. Retry after the current images finish.',
            cancelMessage,
            closedMessage,
        });
        this.pending = this.queue.pending;
    }

    async get(key, load, { signal } = {}) {
        if (this.queue.stats().closed) throw Error(this.closedMessage);
        if (signal?.aborted) throw Error(this.cancelMessage);
        const hit = this.entries.get(key);
        if (hit) {
            this.entries.delete(key);
            this.entries.set(key, hit);
            return hit.value;
        }
        const epoch = this.epoch;
        return this.queue.execute(key, loadSignal => this.load(key, load, epoch, loadSignal), { signal });
    }

    async load(key, load, epoch, loadSignal) {
        if (epoch === this.epoch && this.entries.has(key)) {
            const hit = this.entries.get(key);
            this.entries.delete(key);
            this.entries.set(key, hit);
            return hit.value;
        }
        const value = await load(loadSignal);
        const size = value.width * value.height * 4;
        if (epoch !== this.epoch || size > this.maxBytes) return value;
        if (this.entries.has(key)) return this.entries.get(key).value;
        while (this.bytes + size > this.maxBytes && this.entries.size) {
            const oldest = this.entries.keys().next().value;
            this.bytes -= this.entries.get(oldest).size;
            this.entries.delete(oldest);
        }
        this.entries.set(key, { value, size });
        this.bytes += size;
        return value;
    }

    stats() {
        return { bytes: this.bytes, maxBytes: this.maxBytes, entries: this.entries.size, ...this.queue.stats() };
    }

    clear() {
        this.epoch++;
        this.entries.clear();
        this.queue.detachPending();
        this.bytes = 0;
    }

    dispose() {
        this.clear();
        this.queue.dispose();
    }
}
