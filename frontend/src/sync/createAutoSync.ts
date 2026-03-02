import type { RxDatabase } from "rxdb";
import type { AppCollections } from "../db";
import { getToken } from "../auth";

type Checkpoint = { id: string; updatedAt: number } | null;

interface SyncConfig {
    checkpointKey: string;
    pushPath: string;
    pullPath: string;
    collectionName: keyof AppCollections;
}

export function createAutoSync(config: SyncConfig) {
    return function startSync(opts: {
        db: RxDatabase<AppCollections>;
        baseUrl?: string;
        debounceMs?: number;
        pollMs?: number;
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
        let applyingRemote = false;
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
            const res = await fetch(`${baseUrl}${config.pullPath}`, {
                method: "POST",
                headers: { "content-type": "application/json", "Authorization": `Bearer ${getToken()}` },
                body: JSON.stringify({ checkpoint: cp, limit: 200 })
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

        const sub = collection.$.subscribe((ev: any) => {
            if (stopped) return;
            if (applyingRemote) return;

            const id = ev?.documentId;
            if (typeof id === "string") dirtyIds.add(id);

            scheduleDebounce();
        });

        pollTimer = window.setInterval(() => sync("poll"), pollMs);
        window.addEventListener("online", () => sync("online"));

        (async () => {
            const allDocs = await collection.find().exec();
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
    };
}
