// Stable no-op subscribe for useSyncExternalStore one-shot localStorage reads.
// The value never changes after mount, so there is nothing to subscribe to;
// returning a module-level constant keeps the store reference stable across
// renders without a per-component useCallback.
export const noopSubscribe = () => () => {};
