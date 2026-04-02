import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function EventTable({ events, localMap, onImport }: {
    events: CtftimeEvent[];
    localMap: Map<number, string[]>;
    onImport: (event: CtftimeEvent) => void;
}) {
    if (events.length === 0) return <div className="empty-state">No events found.</div>;

    return (
        <div className="card" style={{ padding: 0 }}>
            <table className="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Local event</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {events.map((ev) => {
                        const localId = localMap.get(ev.id);
                        return (
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
                                <td>
                                    {localId && localId.length > 0
                                        ? <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {localId.map((id, i) => (
                                                <Link key={id} className="accent-link" to={`/events/${id}`}>View {localId.length > 1 ? i + 1 : ""}</Link>
                                            ))}
                                          </span>
                                        : <span style={{ color: "var(--muted)", fontSize: 13 }}>-</span>
                                    }
                                </td>
                                <td style={{ textAlign: "right" }}>
                                    <button className="btn btn-primary" onClick={() => onImport(ev)}>
                                        Import
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function CtftimePage() {
    const navigate = useNavigate();
    const [upcoming, setUpcoming] = useState<CtftimeEvent[]>([]);
    const [running, setRunning] = useState<CtftimeEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [localMap, setLocalMap] = useState<Map<number, string[]>>(new Map());

    useEffect(() => {
        async function init() {
            try {
                const [upcomingRes, runningRes, db] = await Promise.all([
                    authFetch("/api/ctftime/events"),
                    authFetch("/api/ctftime/events/running"),
                    getDb(),
                ]);
                if (!upcomingRes.ok) throw new Error(`${upcomingRes.status} ${upcomingRes.statusText}`);
                if (!runningRes.ok) throw new Error(`${runningRes.status} ${runningRes.statusText}`);

                const [upcomingData, runningData] = await Promise.all([
                    upcomingRes.json(),
                    runningRes.json(),
                ]);
                setUpcoming(upcomingData);
                setRunning(runningData);

                const localEvents = await db.events.find().exec();
                const map = new Map<number, string[]>();
                for (const d of localEvents) {
                    const doc = d.toJSON();
                    if (doc.ctftimeId != null && !doc.isDeleted) {
                        const existing = map.get(doc.ctftimeId) ?? [];
                        map.set(doc.ctftimeId, [...existing, doc.id]);
                    }
                }
                setLocalMap(map);
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
        const newId = makeId();
        await db.events.insert({
            id: newId,
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
        setLocalMap(prev => {
            const next = new Map(prev);
            const existing = next.get(event.id) ?? [];
            next.set(event.id, [...existing, newId]);
            return next;
        });
        navigate(`/events/${newId}`);
    }

    return (
        <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <h2 className="page-title" style={{ margin: 0 }}>CTFtime events</h2>
            </div>

            {loading && <div className="empty-state">Loading...</div>}
            {error && <div className="empty-state" style={{ color: "var(--danger)" }}>Failed to load: {error}</div>}

            {!loading && !error && (
                <>
                    <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)", margin: "0 0 10px 0" }}>Running now</h3>
                    <EventTable events={running} localMap={localMap} onImport={importEvent} />

                    <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)", margin: "24px 0 10px 0" }}>Upcoming</h3>
                    <EventTable events={upcoming} localMap={localMap} onImport={importEvent} />
                </>
            )}
        </div>
    );
}
