import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDb, type EventDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { makeId, formatDate } from "../utils";
import { getUserIdFromToken, isEventBased } from "../auth";
import "../styles/ui.css";

function AddEventOverlay({ onClose, onAdd }: {
    onClose: () => void;
    onAdd: (name: string, desc: string, startAt: string, endAt: string, flagFormat: string) => void;
}) {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");
    const [flagFormat, setFlagFormat] = useState("");

    function submit() {
        if (!name.trim()) return;
        onAdd(name, desc, startAt, endAt, flagFormat);
        onClose();
    }

    return (
        <div className="overlay" onClick={onClose}>
            <div className="overlay-box" onClick={e => e.stopPropagation()}>
                <div className="overlay-box-header">
                    <h5 className="m-0 text-[15px] font-semibold">New event</h5>
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
                        <span className="form-field-label">Flag format<span className="form-field-optional">(optional)</span></span>
                        <input className="input" value={flagFormat} onChange={e => setFlagFormat(e.target.value)} placeholder="flag{...}" />
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

    async function createEvent(name: string, desc: string, startAt: string, endAt: string, flagFormat: string) {
        try {
            const db = await getDb();
            await db.events.insert({
                id: makeId(),
                name: name.trim(),
                description: desc.trim(),
                flagFormat: flagFormat.trim(),
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
        <div className="max-w-[900px] mx-auto my-8 px-4">
            <div className="flex items-center mb-5">
                <h2 className="text-text font-semibold text-xl m-0">Events</h2>
                {!isEventBased() && (
                    <button className="btn btn-primary ml-auto" onClick={() => setShowForm(true)}>
                        New event
                    </button>
                )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-muted inline-block shrink-0" />
                <span>{status}</span>
            </div>

            {events.length === 0 ? (
                <div className="text-muted text-sm py-8 text-center">No events yet.</div>
            ) : (
                <div className="card p-0">
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
                                    className="cursor-pointer"
                                    onClick={() => navigate(`/events/${ev.id}`)}
                                >
                                    <td className="font-medium">{ev.name}</td>
                                    <td className="text-muted">{ev.description || "-"}</td>
                                    <td className="text-muted whitespace-nowrap">{formatDate(ev.startAt)}</td>
                                    <td className="text-muted whitespace-nowrap">{formatDate(ev.endAt)}</td>
                                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
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
