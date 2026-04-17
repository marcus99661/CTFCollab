import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { getToken } from "./auth";

const activeNotes = new Set<string>();

export function markNoteActive(id: string) { activeNotes.add(id); }
export function unmarkNoteActive(id: string) { activeNotes.delete(id); }

function getWsBaseUrl(): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/yjs`;
}

interface Options {
    delayMs?: number;
    timeoutMs?: number;
}

export function startNotePrefetch(noteIds: string[], opts: Options = {}): () => void {
    const delayMs = opts.delayMs ?? 250;
    const timeoutMs = opts.timeoutMs ?? 5000;
    let cancelled = false;

    (async () => {
        for (const id of noteIds) {
            if (cancelled) return;
            if (activeNotes.has(id)) continue;
            await prefetchOne(id, timeoutMs);
            if (cancelled) return;
            await sleep(delayMs);
        }
    })();

    return () => { cancelled = true; };
}

function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
}

async function prefetchOne(noteId: string, timeoutMs: number) {
    const ydoc = new Y.Doc();
    const idb = new IndexeddbPersistence(`note-${noteId}`, ydoc);
    const ws = new WebsocketProvider(
        getWsBaseUrl(),
        `${noteId}?token=${getToken()}`,
        ydoc,
        { connect: true },
    );
    try {
        await Promise.race([
            new Promise<void>((res) => {
                const onSync = (synced: boolean) => {
                    if (synced) { ws.off("sync", onSync); res(); }
                };
                ws.on("sync", onSync);
            }),
            sleep(timeoutMs),
        ]);
        await idb.whenSynced;
    } finally {
        ws.destroy();
        idb.destroy();
        ydoc.destroy();
    }
}