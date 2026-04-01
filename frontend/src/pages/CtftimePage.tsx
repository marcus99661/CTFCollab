import { useEffect, useState } from "react";
import { getDb } from "../db";
import { authFetch, getUserIdFromToken } from "../auth";
import { makeId, formatDate } from "../utils";
import "../styles/ui.css";

interface CtftimeEvent {
    id: number;
    title: string;
    description: string;
    url: string;
    start: string;
    finish: string;
}

export default function CtftimePage() {
    const [events, setEvents] = useState<CtftimeEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [imported, setImported] = useState<Set<number>>(new Set());

    useEffect(() => {
        async function init() {
            try {
                const [res, db] = await Promise.all([
                    authFetch("/api/ctftime/events"),
                    getDb(),
                ]);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const data = await res.json();
                setEvents(data);

                const localEvents = await db.events.find().exec();
                const alreadyImported = new Set<number>(
                    localEvents
                        .map((d: any) => d.toJSON().ctftimeId)
                        .filter((id: any) => id != null)
                );
                setImported(alreadyImported);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, []);

    async function importEvent(event: CtftimeEvent) {
        const db = await getDb();
        await db.events.insert({
            id: makeId(),
            name: event.title,
            description: event.description,
            createdBy: getUserIdFromToken() ?? "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDeleted: false,
            startAt: new Date(event.start).getTime(),
            endAt: new Date(event.finish).getTime(),
            ctftimeId: event.id,
        });
        setImported(prev => new Set(prev).add(event.id));
    }

    return (
        <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <h2 className="page-title" style={{ margin: 0 }}>CTFtime events</h2>
            </div>

            {loading && <div className="empty-state">Loading...</div>}
            {error && <div className="empty-state" style={{ color: "var(--danger)" }}>Failed to load: {error}</div>}

            {!loading && !error && events.length === 0 && (
                <div className="empty-state">No events found.</div>
            )}

            {events.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Start</th>
                                <th>End</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((ev) => (
                                <tr key={ev.id}>
                                    <td style={{ fontWeight: 500 }}>
                                        <a className="accent-link" href={ev.url} target="_blank" rel="noreferrer">
                                            {ev.title}
                                        </a>
                                    </td>
                                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                                        {formatDate(new Date(ev.start).getTime())}
                                    </td>
                                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                                        {formatDate(new Date(ev.finish).getTime())}
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => importEvent(ev)}
                                            disabled={imported.has(ev.id)}
                                        >
                                            {imported.has(ev.id) ? "Imported" : "Import"}
                                        </button>
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