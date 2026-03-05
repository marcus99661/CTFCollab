import { useEffect, useMemo, useState } from "react";
import { getDb, type NoteDoc } from "../db";
import { startNotesAutoSync } from "../sync/notesSync";
import { makeId } from "../utils";
import NoteEditor from "../components/NoteEditor";
import "../styles/ui.css";

function relativeTime(ms: number) {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function statusDotClass(status: string) {
    if (status === "Ready" || status.includes("synced")) return "ok";
    if (status.includes("Sync") || status.includes("Loading")) return "syncing";
    if (status.includes("fail") || status.includes("error")) return "err";
    return "";
}

export default function NotesPage() {
    const [status, setStatus] = useState("Loading…");
    const [notes, setNotes] = useState<NoteDoc[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [newTitle, setNewTitle] = useState("");

    const selected = useMemo(
        () => notes.find((n) => n.id === selectedId) ?? null,
        [notes, selectedId]
    );

    useEffect(() => {
        let stopSync: null | (() => void) = null;
        let sub: any = null;

        (async () => {
            const db = await getDb();

            stopSync = startNotesAutoSync({
                db,
                baseUrl: "",
                debounceMs: 900,
                pollMs: 4000,
                onStatus: setStatus,
            });

            sub = db.notes.find().$.subscribe((docs: any[]) => {
                const list: NoteDoc[] = (docs ?? [])
                    .map((d: any) => (d?.toJSON ? d.toJSON() : d))
                    .filter((d: NoteDoc) => !d.isDeleted)
                    .sort((a: NoteDoc, b: NoteDoc) => b.updatedAt - a.updatedAt);

                setNotes(list);
                setSelectedId((prev) => prev || list[0]?.id || "");
            });

            setStatus("Ready");
        })().catch((e) => {
            console.error("NotesPage init failed:", e);
            setStatus("Init failed (check console)");
        });

        return () => {
            if (sub) sub.unsubscribe();
            if (stopSync) stopSync();
        };
    }, []);

    async function createNote() {
        const title = newTitle.trim() || "Untitled note";
        try {
            const db = await getDb();
            const id = makeId();
            await db.notes.insert({
                id,
                title,
                content: "",
                updatedAt: Date.now(),
                isDeleted: false,
            });
            setSelectedId(id);
            setNewTitle("");
        } catch (e) {
            console.error("createNote failed:", e);
            setStatus("Create note failed (check console)");
        }
    }

    async function deleteSelected() {
        if (!selected) return;
        if (!confirm(`Delete "${selected.title}"?`)) return;
        try {
            const db = await getDb();
            const doc = await db.notes.findOne(selected.id).exec();
            if (!doc) return;
            await doc.patch({ isDeleted: true, updatedAt: Date.now() });
            setSelectedId("");
        } catch (e) {
            console.error("deleteSelected failed:", e);
            setStatus("Delete failed (check console)");
        }
    }

    async function updateTitle(next: string) {
        if (!selected) return;
        try {
            const db = await getDb();
            const doc = await db.notes.findOne(selected.id).exec();
            if (!doc) return;
            await doc.patch({ title: next, updatedAt: Date.now() });
        } catch (e) {
            console.error("updateTitle failed:", e);
            setStatus("Save failed (check console)");
        }
    }

    return (
        <div style={{ display: "flex", height: "calc(100vh - 52px - 41px)" }}>
            {/* Sidebar */}
            <aside style={{
                width: 240,
                flexShrink: 0,
                borderRight: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                background: "var(--surface)",
            }}>
                <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--border)" }}>
                    <div className="status-bar">
                        <span className={`dot ${statusDotClass(status)}`} />
                        <span>{status}</span>
                    </div>
                </div>

                {/* Note list */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {notes.length === 0 ? (
                        <div className="empty-state" style={{ padding: "32px 12px" }}>No notes yet</div>
                    ) : (
                        notes.map((n) => (
                            <div
                                key={n.id}
                                onClick={() => setSelectedId(n.id)}
                                style={{
                                    padding: "10px 12px",
                                    cursor: "pointer",
                                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                                    background: n.id === selectedId ? "rgba(88,166,255,0.08)" : "transparent",
                                    borderLeft: n.id === selectedId ? "2px solid var(--accent)" : "2px solid transparent",
                                    transition: "background 0.1s",
                                }}
                                onMouseEnter={e => {
                                    if (n.id !== selectedId)
                                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                                }}
                                onMouseLeave={e => {
                                    if (n.id !== selectedId)
                                        (e.currentTarget as HTMLElement).style.background = "transparent";
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {n.title}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>{relativeTime(n.updatedAt)}</div>
                            </div>
                        ))
                    )}
                </div>

                {/* New note input */}
                <div style={{ padding: 10, borderTop: "1px solid var(--border)", display: "flex", gap: 6 }}>
                    <input
                        className="input"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="New note…"
                        style={{ flex: 1, minWidth: 0 }}
                        onKeyDown={(e) => { if (e.key === "Enter") createNote(); }}
                    />
                    <button className="btn btn-primary" onClick={createNote} style={{ padding: "7px 10px" }}>+</button>
                </div>
            </aside>

            {/* Editor area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {!selected ? (
                    <div className="empty-state" style={{ margin: "auto" }}>
                        Select a note or create one
                    </div>
                ) : (
                    <>
                        {/* Title bar */}
                        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                                className="input"
                                value={selected.title}
                                onChange={(e) => updateTitle(e.target.value)}
                                style={{ flex: 1, fontSize: 16, fontWeight: 600 }}
                            />
                            <button className="btn btn-danger" onClick={deleteSelected}>Delete</button>
                        </div>
                        {/* Editor */}
                        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
                            <NoteEditor key={selected.id} noteId={selected.id} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
