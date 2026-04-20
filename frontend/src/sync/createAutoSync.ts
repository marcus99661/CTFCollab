import type { RxDatabase } from "rxdb";
import type { AppCollections } from "../db";
import { getToken } from "../auth";

// Checkpoint that tracks what was pulled from server last time.
// Used for incremental update from backend
type Checkpoint = { id: string; updatedAt: number } | null;

interface SyncConfig {
    checkpointKey: string;
    pushPath: string;
    pullPath: string;
    collectionName: keyof AppCollections;
}

// Sync function for events, challenges, notes
export function createAutoSync(config: SyncConfig) {
    return function startSync(opts: {
        db: RxDatabase<AppCollections>;
        baseUrl?: string;
        debounceMs?: number;  // how long to wait ms after a local change to push
        pollMs?: number;      // how often to pull from backend
        onStatus?: (s: string) => void;
    }) {
        const baseUrl = opts.baseUrl ?? "";
        const debounceMs = opts.debounceMs ?? 900;
        const pollMs = opts.pollMs ?? 5000;
        const onStatus = opts.onStatus ?? (() => {});
        let stopped = false;

        const collection = opts.db[config.collectionName] as any;

        function loadCp(): Checkpoint {
            try {
                const raw = localStorage.getItem(config.checkpointKey);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        }
        function saveCp(cp: Checkpoint) {
            try {
                if (!cp) localStorage.removeItem(config.checkpointKey);
                else localStorage.setItem(config.checkpointKey, JSON.stringify(cp));
            } catch {}
        }

        let cp: Checkpoint = loadCp();
        let syncing = false;
        let debounceTimer: number | null = null;
        let pollTimer: number | null = null;

        // Flag set while writing server data to local DB. Prevents those same changes from being pushed to server
        let applyingRemote = false;

        // Set of document IDs that have been locally changed and need to be pushed to the server
        const dirtyIds = new Set<string>();

        async function pushDirty() {
            if (dirtyIds.size === 0) return;

            const ids = Array.from(dirtyIds);
            const docs = await collection.findByIds(ids).exec();
            const rows = Array.from(docs.values()).map((doc: any) => ({ newDocumentState: doc.toJSON() }));

            if (rows.length === 0) return;

            const res = await fetch(`${baseUrl}${config.pushPath}`, {
                method: "POST",
                headers: { "content-type": "application/json", "Authorization": `Bearer ${getToken()}` },
                body: JSON.stringify({ rows })
            });

            if (!res.ok) throw new Error(`Push failed: ${res.status} ${res.statusText}`);

            const json = await res.json().catch(() => ({}));

            // If the server returns newer data then overwrite
            if (Array.isArray(json.conflicts) && json.conflicts.length > 0) {
                applyingRemote = true;
                try {
                    for (const c of json.conflicts) {
                        await collection.upsert(c);
                    }
                } finally {
                    applyingRemote = false;
                }
            }

            dirtyIds.clear();
        }

        async function pull() {
            const limit = 200;

            // Drain the server in a single sync cycle so a fresh client or a
            // newly joined event doesn't trickle in one batch per poll tick.
            while (true) {
                const res = await fetch(`${baseUrl}${config.pullPath}`, {
                    method: "POST",
                    headers: { "content-type": "application/json", "Authorization": `Bearer ${getToken()}` },
                    body: JSON.stringify({ checkpoint: cp, limit })
                });

                if (!res.ok) throw new Error(`Pull failed: ${res.status} ${res.statusText}`);

                const json = await res.json();
                const docs = json.documents ?? [];
                const nextCp = json.checkpoint ?? cp;

                if (docs.length > 0) {
                    applyingRemote = true;
                    try {
                        for (const d of docs) {
                            await collection.upsert(d);
                        }
                    } finally {
                        applyingRemote = false;
                    }
                }

                cp = nextCp;
                saveCp(cp);

                if (docs.length < limit) break;
            }
        }

        async function sync(reason: string) {
            if (stopped) return;
            if (!navigator.onLine) {
                onStatus("Offline (saved locally)");
                return;
            }
            if (syncing) return; // don't run two syncs at the same time

            syncing = true;
            onStatus(`Syncing... (${reason})`);
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

        // Watch for local changes and mark those documents as dirty
        const sub = collection.$.subscribe((ev: any) => {
            if (stopped) return;
            if (applyingRemote) return; // ignore changes we just got from the server

            const id = ev?.documentId;
            if (typeof id === "string") dirtyIds.add(id);

            scheduleDebounce();
        });

        // Periodically pull from the server to catch changes made by other users
        pollTimer = window.setInterval(() => sync("poll"), pollMs);
        window.addEventListener("online", () => sync("online"));

        // On startup, mark all existing local docs as dirty so they get pushed
        (async () => {
            const allDocs = await collection.find().exec();
            for (const doc of allDocs) {
                dirtyIds.add((doc as any).id as string);
            }
            sync("startup");
        })();

        // Returns a cleanup function
        return () => {
            stopped = true;
            sub.unsubscribe();
            if (debounceTimer) window.clearTimeout(debounceTimer);
            if (pollTimer) window.clearInterval(pollTimer);
        };
    };
}
