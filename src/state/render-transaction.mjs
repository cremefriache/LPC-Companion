/** Publish only the newest complete render. Rejection never changes accepted state. */
export function createRenderTransaction(prepare, commit) {
    let generation = 0;
    let disposed = false;
    return {
        async submit(candidate) {
            const token = ++generation;
            try {
                const result = await prepare(candidate, () => !disposed && token === generation);
                if (disposed || token !== generation) return false;
                commit(candidate, result);
                return true;
            } catch (error) {
                if (disposed || token !== generation) return false;
                throw error;
            }
        },
        dispose() { disposed = true; generation++; },
    };
}
