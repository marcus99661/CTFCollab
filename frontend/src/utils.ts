export function makeId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
    );
}
