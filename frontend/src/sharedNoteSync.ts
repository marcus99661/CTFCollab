// frontend/src/sharedNoteSync.ts
import type { RxDatabase } from "rxdb";
import type { AppCollections } from "./db";

type Checkpoint = { id: string; updatedAt: number } | null;

const CHECKPOINT_KEY = "sharedNoteCheckpoint_v1";

function loadCheckpoint(): Checkpoint {
    try {
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveCheckpoint(cp: Checkpoint) {
    try {
        if (!cp) localStorage.removeItem(CHECKPOINT_KEY);
        else localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
    } catch {
        // ignore
    }
}

export function startSharedNoteAutoSync(opts: {
    db: RxDatabase<AppCollections>;
    backendBaseUrl: string; // e.g. "http://127.0.0.1:3000"
    noteId?: string; // defaults to "shared"
    debounceMs?: number; // defaults to 900ms
    pollMs?: number; // defaults to 10000ms fallback
    onStatus?: (s: string) => void;
}) {
    const noteId = opts.noteId ?? "shared";
    const debounceMs = opts.debounceMs ?? 900;
    const pollMs = opts.pollMs ?? 10_000;

    const onStatus = opts.onStatus ?? (() => {});
    let stopped = false;

    let checkpoint: Checkpoint = loadCheckpoint();
    let syncing = false;
    let debounceTimer: number | null = null;
    let pollTimer: number | null = null;
    let applyingRemote = false;

    async function pushLocal() {
        const doc = await opts.db.notes.findOne(noteId).exec();
        if (!doc) return;

        // IMPORTANT: push the stored doc as-is (do not bump updatedAt here)
        const local = doc.toJSON();

        const res = await fetch(`${opts.backendBaseUrl}/replication/push`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rows: [{ newDocumentState: local }] })
        });

        const json = await res.json().catch(() => ({}));

        // If server has newer version, accept it (PoC conflict strategy)
        if (Array.isArray(json.conflicts) && json.conflicts.length > 0) {
            applyingRemote = true;
            try {
                for (const c of json.conflicts) {
                    await opts.db.notes.upsert(c);
                }
            } finally {
                applyingRemote = false;
            }
        }
    }

    async function pullRemote() {
        const res = await fetch(`${opts.backendBaseUrl}/replication/pull`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ checkpoint, limit: 10 })
        });

        const json = await res.json();
        const docs = json.documents ?? [];
        const cp = json.checkpoint ?? null;

        if (docs.length > 0) {
            applyingRemote = true;
            try {
                for (const d of docs) {
                    await opts.db.notes.upsert(d);
                }
            } finally {
                applyingRemote = false;
            }
        }

        checkpoint = cp;
        saveCheckpoint(checkpoint);
    }

    async function syncCycle(reason: string) {
        if (stopped) return;
        if (!navigator.onLine) {
            onStatus("Offline (saved locally)");
            return;
        }
        if (syncing) return;

        syncing = true;
        onStatus(`Syncing… (${reason})`);
        try {
            await pushLocal();
            await pullRemote();
            onStatus("Synced");
        } catch {
            onStatus("Sync failed (will retry)");
        } finally {
            syncing = false;
        }
    }

    function scheduleDebouncedSync() {
        if (stopped) return;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            syncCycle("debounce");
        }, debounceMs);
    }

    // 1) Listen to local doc changes and debounce sync (typing → pause → sync)
    const sub = opts.db.notes.findOne(noteId).$.subscribe((d: any) => {
        if (stopped || !d) return;
        if (applyingRemote) return; // ignore changes we just pulled
        scheduleDebouncedSync();
    });

    // 2) Sync immediately when coming online
    const onOnline = () => syncCycle("online");
    window.addEventListener("online", onOnline);

    // 3) Fallback polling (in case SSE fails or is blocked)
    pollTimer = window.setInterval(() => {
        syncCycle("poll");
    }, pollMs);

    // 4) Run an initial sync
    syncCycle("startup");

    // This will be wired when you add the backend SSE endpoint below.
    let es: EventSource | null = null;
    try {
        es = new EventSource(`${opts.backendBaseUrl}/replication/subscribe`);
        es.addEventListener("note", () => {
            // Server says “note changed” → pull right away
            syncCycle("sse");
        });
        es.onerror = () => {
            // Let polling handle it. Close to avoid endless reconnect spam.
            es?.close();
            es = null;
        };
    } catch {
        // ignore, polling still works
    }

    return () => {
        stopped = true;
        sub.unsubscribe();
        window.removeEventListener("online", onOnline);
        if (debounceTimer) window.clearTimeout(debounceTimer);
        if (pollTimer) window.clearInterval(pollTimer);
        if (es) es.close();
    };
}
