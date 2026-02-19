import type { RxDatabase } from "rxdb";
import type { AppCollections } from "./db";

type Checkpoint = { id: string; updatedAt: number } | null;
const CP_KEY = "notesCheckpoint_v1";

function loadCp(): Checkpoint {
    try {
        const raw = localStorage.getItem(CP_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function saveCp(cp: Checkpoint) {
    try {
        if (!cp) localStorage.removeItem(CP_KEY);
        else localStorage.setItem(CP_KEY, JSON.stringify(cp));
    } catch {}
}

export function startNotesAutoSync(opts: {
    db: RxDatabase<AppCollections>;
    baseUrl?: string;        // "" recommended when nginx proxies to backend
    debounceMs?: number;     // after typing stops
    pollMs?: number;         // periodic pull
    onStatus?: (s: string) => void;
}) {
    const baseUrl = opts.baseUrl ?? "";
    const debounceMs = opts.debounceMs ?? 900;
    const pollMs = opts.pollMs ?? 5000;

    const onStatus = opts.onStatus ?? (() => {});
    let stopped = false;

    let cp: Checkpoint = loadCp();
    let syncing = false;
    let debounceTimer: number | null = null;
    let pollTimer: number | null = null;

    let applyingRemote = false;
    const dirtyIds = new Set<string>();

    async function pushDirty() {
        if (dirtyIds.size === 0) return;

        const ids = Array.from(dirtyIds);
        const docs = await opts.db.notes.findByIds(ids).exec();
        const rows = Array.from(docs.values()).map((doc: any) => ({ newDocumentState: doc.toJSON() }));

        if (rows.length === 0) return;

        const res = await fetch(`${baseUrl}/replication/push`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rows })
        });

        const json = await res.json().catch(() => ({}));
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

        dirtyIds.clear();
    }

    async function pull() {
        const res = await fetch(`${baseUrl}/replication/pull`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ checkpoint: cp, limit: 200 })
        });

        const json = await res.json();
        const docs = json.documents ?? [];
        const nextCp = json.checkpoint ?? cp;

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

        cp = nextCp;
        saveCp(cp);
    }

    async function sync(reason: string) {
        if (stopped) return;
        if (!navigator.onLine) {
            onStatus("Offline (saved locally)");
            return;
        }
        if (syncing) return;

        syncing = true;
        onStatus(`Syncing… (${reason})`);
        try {
            await pushDirty();
            await pull();
            onStatus("Synced");
        } catch {
            onStatus("Sync failed (will retry)");
        } finally {
            syncing = false;
        }
    }

    function scheduleDebounce() {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => sync("debounce"), debounceMs);
    }

    // Mark docs dirty on local changes (ignore remote-applied changes)
    const sub = opts.db.notes.$.subscribe((ev: any) => {
        if (stopped) return;
        if (applyingRemote) return;

        const id = ev?.documentId;
        if (typeof id === "string") dirtyIds.add(id);

        scheduleDebounce();
    });

    // periodic pull
    pollTimer = window.setInterval(() => sync("poll"), pollMs);
    window.addEventListener("online", () => sync("online"));

    // initial sync: mark all existing local notes dirty so they get pushed
    (async () => {
        const allDocs = await opts.db.notes.find().exec();
        for (const doc of allDocs) {
            dirtyIds.add((doc as any).id as string);
        }
        sync("startup");
    })();

    return () => {
        stopped = true;
        sub.unsubscribe();
        if (debounceTimer) window.clearTimeout(debounceTimer);
        if (pollTimer) window.clearInterval(pollTimer);
    };
}
