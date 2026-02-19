import { useEffect, useState } from "react";
import { getDb, type EventDoc } from "../db";
import { startEventsAutoSync } from "../eventsSync";

export default function EventsPage() {
    const [status, setStatus] = useState("Loading…");
    const [events, setEvents] = useState<EventDoc[]>([]);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");

    useEffect(() => {
        let stopSync: null | (() => void) = null;
        let sub: any = null;

        (async () => {
            const db = await getDb();

            stopSync = startEventsAutoSync({
                db,
                baseUrl: "",
                debounceMs: 900,
                pollMs: 4000,
                onStatus: setStatus,
            });

            sub = db.events.find().$.subscribe((docs: any[]) => {
                const list: EventDoc[] = (docs ?? [])
                    .map((d: any) => (d?.toJSON ? d.toJSON() : d))
                    .filter((d: EventDoc) => !d.isDeleted)
                    .sort((a: EventDoc, b: EventDoc) => b.updatedAt - a.updatedAt);

                setEvents(list);
            });

            setStatus("Ready");
        })().catch((e) => {
            console.error("EventsPage init failed:", e);
            setStatus("Init failed (check console)");
        });

        return () => {
            if (sub) sub.unsubscribe();
            if (stopSync) stopSync();
        };
    }, []);

    async function createEvent() {
        const name = newName.trim();
        if (!name) return;

        try {
            const db = await getDb();
            await db.events.insert({
                id: crypto.randomUUID(),
                name,
                description: newDesc.trim(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
            });
            setNewName("");
            setNewDesc("");
        } catch (e) {
            console.error("createEvent failed:", e);
            setStatus("Create event failed (check console)");
        }
    }

    async function deleteEvent(id: string) {
        try {
            const db = await getDb();
            const doc = await db.events.findOne(id).exec();
            if (!doc) return;
            await doc.patch({ isDeleted: true, updatedAt: Date.now() });
        } catch (e) {
            console.error("deleteEvent failed:", e);
            setStatus("Delete failed (check console)");
        }
    }

    return (
        <div style={{ maxWidth: 980, margin: "32px auto", padding: 16 }}>
            <h1>Events</h1>
            <div style={{ marginBottom: 12, opacity: 0.8 }}>Status: {status}</div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Event name (required)"
                    style={{ padding: 8, minWidth: 220 }}
                    onKeyDown={(e) => { if (e.key === "Enter") createEvent(); }}
                />
                <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Description"
                    style={{ padding: 8, minWidth: 300 }}
                    onKeyDown={(e) => { if (e.key === "Enter") createEvent(); }}
                />
                <button onClick={createEvent} disabled={!newName.trim()}>Add Event</button>
            </div>

            {events.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No events yet.</div>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Name</th>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Description</th>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Updated</th>
                            <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((ev) => (
                            <tr key={ev.id}>
                                <td style={{ padding: 8 }}>{ev.name}</td>
                                <td style={{ padding: 8 }}>{ev.description}</td>
                                <td style={{ padding: 8, opacity: 0.7 }}>{new Date(ev.updatedAt).toLocaleString()}</td>
                                <td style={{ padding: 8 }}>
                                    <button onClick={() => deleteEvent(ev.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
