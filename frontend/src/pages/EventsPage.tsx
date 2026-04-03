import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDb, type EventDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { makeId, formatDate } from "../utils";
import { getUserIdFromToken, isEventBased } from "../auth";
import "../styles/ui.css";

function AddEventOverlay({ onClose, onAdd }: {
    onClose: () => void;
    onAdd: (name: string, desc: string, startAt: string, endAt: string) => void;
}) {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");

    function submit() {
        if (!name.trim()) return;
        onAdd(name, desc, startAt, endAt);
        onClose();
    }

    return (
        <div className="overlay" onClick={onClose}>
            <div className="overlay-box" onClick={e => e.stopPropagation()}>
                <div className="overlay-box-header">
                    <h5 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>New event</h5>
                </div>
                <div className="overlay-box-body">
                    <label className="form-field">
                        <span className="form-field-label">Name</span>
                        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Event name" autoFocus />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">Description<span className="form-field-optional">(optional)</span></span>
                        <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="" />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">Start<span className="form-field-optional">(optional)</span></span>
                        <input className="input" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">End<span className="form-field-optional">(optional)</span></span>
                        <input className="input" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
                    </label>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>Create</button>
                        <button className="btn" onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function EventsPage() {
    const [status, setStatus] = useState("Loading...");
    const [events, setEvents] = useState<EventDoc[]>([]);
    const [showForm, setShowForm] = useState(false);
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

    async function createEvent(name: string, desc: string, startAt: string, endAt: string) {
        try {
            const db = await getDb();
            await db.events.insert({
                id: makeId(),
                name: name.trim(),
                description: desc.trim(),
                createdBy: getUserIdFromToken() ?? "",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
                startAt: startAt ? new Date(startAt).getTime() : null,
                endAt: endAt ? new Date(endAt).getTime() : null,
            });
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
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <h2 className="page-title" style={{ margin: 0 }}>Events</h2>
                {!isEventBased() && (
                    <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ marginLeft: "auto" }}>
                        New event
                    </button>
                )}
            </div>

            <div style={{ marginBottom: 12 }}>
                <div className="status-bar">
                    <span className="dot" />
                    <span>{status}</span>
                </div>
            </div>

            {events.length === 0 ? (
                <div className="empty-state">No events yet.</div>
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

            {showForm && (
                <AddEventOverlay
                    onClose={() => setShowForm(false)}
                    onAdd={createEvent}
                />
            )}
        </div>
    );
}