import { useEffect, useState } from "react";
import { getDb } from "./db";

export default function App() {
    const [content, setContent] = useState("");
    const [status, setStatus] = useState<string>("Loading...");
    const [dbReady, setDbReady] = useState(false);

    useEffect(() => {
        let alive = true;

        (async () => {
            const db = await getDb();
            const doc = await db.notes.findOne("shared").exec();
            if (!doc) return;

            // Subscribe to changes so UI updates across tabs/devices later
            const sub = doc.$.subscribe((d: any) => {
                if (!alive || !d) return;
                setContent(d.content);
                setDbReady(true);
                setStatus("Ready (local)");
            });

            return () => sub.unsubscribe();
        })();

        return () => {
            alive = false;
        };
    }, []);

    async function saveLocal(next: string) {
        setContent(next);
        const db = await getDb();
        const doc = await db.notes.findOne("shared").exec();
        if (!doc) return;
        await doc.patch({ content: next, updatedAt: Date.now() });
        setStatus("Saved locally");
    }

const BACKEND = "http://127.0.0.1:3000";

async function syncNow() {
  setStatus("Syncing...");
  try {
    const db = await getDb();
    const doc = await db.notes.findOne("shared").exec();
    if (!doc) throw new Error("Missing shared note");

    // IMPORTANT: push the actual stored document (do NOT overwrite updatedAt here)
    const local = doc.toJSON(); // { id, content, updatedAt }

    const pushRes = await fetch(`${BACKEND}/replication/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: [{ newDocumentState: local }]
      })
    });

    const pushJson = await pushRes.json().catch(() => ({}));
    // If server reports conflicts, accept server version for PoC
    if (Array.isArray(pushJson.conflicts) && pushJson.conflicts.length > 0) {
      for (const c of pushJson.conflicts) {
        await db.notes.upsert(c);
      }
    }

    const pullRes = await fetch(`${BACKEND}/replication/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkpoint: null, limit: 10 })
    });

    const pullJson = await pullRes.json();
    const docs = pullJson.documents ?? [];
    for (const d of docs) {
      await db.notes.upsert(d);
    }

    setStatus("Synced");
  } catch (e) {
    setStatus("Sync failed (offline?)");
  }
}

    return (
        <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
            <h1>Shared Note PoC</h1>
            <p>Status: {status}</p>

            <textarea
                style={{ width: "100%", height: 300, fontSize: 16 }}
                value={content}
                disabled={!dbReady}
                onChange={(e) => saveLocal(e.target.value)}
            />

            <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
                <button onClick={syncNow} disabled={!dbReady}>
                    Sync now
                </button>
            </div>

            <p style={{ marginTop: 12, opacity: 0.7 }}>
                Tip: open this app in two browser windows to see local updates. Later we’ll
                make it sync automatically + handle conflicts.
            </p>
        </div>
    );
}
