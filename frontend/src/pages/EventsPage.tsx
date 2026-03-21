import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDb, type EventDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { makeId, formatDate } from "../utils";
import { getUserIdFromToken } from "../auth";
import "../styles/ui.css";

export default function EventsPage() {
    const [status, setStatus] = useState("Loading...");
    const [events, setEvents] = useState<EventDoc[]>([]);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newStartAt, setNewStartAt] = useState("");
    const [newEndAt, setNewEndAt] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        let stopSync: null | (() => void) = null;
        let sub: any = null;

        async function init() {
            const db = await getDb();

            stopSync = startEventsAutoSync({
                db,
                baseUrl: "",
                debounceMs: 900,
                pollMs: 4000,
                onStatus: setStatus,
            });

            sub = db.events.find().$.subscribe((docs: any[]) => {
                const list: EventDoc[] = docs
                    .map((d: any) => d.toJSON())
                    .filter((d: EventDoc) => !d.isDeleted)
                    .sort((a: EventDoc, b: EventDoc) => b.updatedAt - a.updatedAt);

                setEvents(list);
            });

            setStatus("Ready");
        }
        init().catch((e) => {
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
                id: makeId(),
                name,
                description: newDesc.trim(),
                createdBy: getUserIdFromToken() ?? "",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
                startAt: newStartAt ? new Date(newStartAt).getTime() : null,
                endAt: newEndAt ? new Date(newEndAt).getTime() : null,
            });
            setNewName("");
            setNewDesc("");
            setNewStartAt("");
            setNewEndAt("");
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
        <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
            <h2 className="page-title">Events</h2>

            <div className="card" style={{ marginBottom: 20 }}>
                <div className="form-row" style={{ marginBottom: 8 }}>
                    <input
                        className="input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Event name (required)"
                        style={{ flex: "1 1 200px" }}
                        onKeyDown={(e) => { if (e.key === "Enter") createEvent(); }}
                    />
                    <input
                        className="input"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Description"
                        style={{ flex: "2 1 260px" }}
                        onKeyDown={(e) => { if (e.key === "Enter") createEvent(); }}
                    />
                </div>
                <div className="form-row">
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>Start</span>
                        <input
                            className="input"
                            type="datetime-local"
                            value={newStartAt}
                            onChange={(e) => setNewStartAt(e.target.value)}
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>End</span>
                        <input
                            className="input"
                            type="datetime-local"
                            value={newEndAt}
                            onChange={(e) => setNewEndAt(e.target.value)}
                        />
                    </label>
                    <button className="btn btn-primary" onClick={createEvent} disabled={!newName.trim()} style={{ alignSelf: "flex-end" }}>
                        Add Event
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: 12 }}>
                <div className="status-bar">
                    <span className="dot" />
                    <span>{status}</span>
                </div>
            </div>

            {events.length === 0 ? (
                <div className="empty-state">No events yet. Create one above.</div>
            ) : (
                <div className="card" style={{ padding: 0 }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Start</th>
                                <th>End</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((ev) => (
                                <tr
                                    key={ev.id}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => navigate(`/events/${ev.id}`)}
                                >
                                    <td style={{ fontWeight: 500 }}>{ev.name}</td>
                                    <td style={{ color: "var(--muted)" }}>{ev.description || "-"}</td>
                                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDate(ev.startAt)}</td>
                                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDate(ev.endAt)}</td>
                                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                        {ev.createdBy === getUserIdFromToken() && (
                                            <button className="btn btn-danger" onClick={() => deleteEvent(ev.id)}>
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
