// web/js/events.js

const bus = new Map();

export function on(event, handler) {
    if (!bus.has(event)) bus.set(event, new Set());
    bus.get(event).add(handler);
    return () => bus.get(event)?.delete(handler);
}

export function emit(event, payload) {
    const handlers = bus.get(event);
    if (!handlers) return;
    for (const fn of handlers) {
        try {
            fn(payload);
        } catch (err) {
            console.error("[Usgromana-Gallery][events] handler error", err);
        }
    }
}
