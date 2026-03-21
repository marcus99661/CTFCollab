export function makeId(): string {
    return crypto.randomUUID();
}

export function formatDate(ts: number | null): string {
    if (!ts) return "-";
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false });
}
