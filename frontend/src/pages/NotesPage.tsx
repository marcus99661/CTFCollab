import { useEffect, useMemo, useState } from "react";
import { getDb, type NoteDoc } from "../db";
import { startNotesAutoSync } from "../sync/notesSync";
import { makeId } from "../utils";
import NoteEditor from "../components/NoteEditor";

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
        <div style={{ maxWidth: 980, margin: "32px auto", padding: 16 }}>
            <h1>Notes PoC</h1>
            <div style={{ marginBottom: 12, opacity: 0.8 }}>Status: {status}</div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    style={{ padding: 8, minWidth: 260 }}
                >
                    {notes.map((n) => (
                        <option key={n.id} value={n.id}>
                            {n.title}
                        </option>
                    ))}
                </select>

                <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="New note title…"
                    style={{ padding: 8, minWidth: 220 }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") createNote();
                    }}
                />

                <button onClick={createNote}>Create</button>
                <button onClick={deleteSelected} disabled={!selected}>
                    Delete
                </button>
            </div>

            {!selected ? (
                <div style={{ opacity: 0.7 }}>No note selected.</div>
            ) : (
                <>
                    <input
                        value={selected.title}
                        onChange={(e) => updateTitle(e.target.value)}
                        style={{ width: "100%", padding: 10, fontSize: 16, marginBottom: 10 }}
                    />

                    <NoteEditor key={selected.id} noteId={selected.id} />
                </>
            )}
        </div>
    );
}
