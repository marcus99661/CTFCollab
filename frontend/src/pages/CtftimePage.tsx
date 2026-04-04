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
    if (events.length === 0) return <div className="text-muted text-sm py-8 text-center">No events found.</div>;

    return (
        <div className="card p-0">
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
                                <td className="font-medium">
                                    <a className="accent-link" href={ev.url} target="_blank" rel="noreferrer">
                                        {ev.title}
                                    </a>
                                </td>
                                <td className="text-muted whitespace-nowrap">
                                    {formatDate(new Date(ev.start).getTime())}
                                </td>
                                <td className="text-muted whitespace-nowrap">
                                    {formatDate(new Date(ev.finish).getTime())}
                                </td>
                                <td>
                                    {localId && localId.length > 0
                                        ? <span className="flex gap-2 flex-wrap">
                                            {localId.map((id, i) => (
                                                <Link key={id} className="accent-link" to={`/events/${id}`}>View {localId.length > 1 ? i + 1 : ""}</Link>
                                            ))}
                                          </span>
                                        : <span className="text-muted text-[13px]">-</span>
                                    }
                                </td>
                                <td className="text-right">
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
        const now = Date.now();
        const doc = {
            id: newId,
            name: event.title,
            description: event.description,
            createdBy: getUserIdFromToken() ?? "",
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            startAt: new Date(event.start).getTime(),
            endAt: new Date(event.finish).getTime(),
            ctftimeId: event.id,
        };
        await db.events.insert(doc);

        setLocalMap(prev => {
            const next = new Map(prev);
            const existing = next.get(event.id) ?? [];
            next.set(event.id, [...existing, newId]);
            return next;
        });
        navigate(`/events/${newId}`);
    }

    return (
        <div className="max-w-[900px] mx-auto my-8 px-4">
            <h2 className="text-text font-semibold text-xl m-0 mb-5">CTFtime events</h2>

            {loading && <div className="text-muted text-sm py-8 text-center">Loading...</div>}
            {error && <div className="text-danger text-sm py-8 text-center">Failed to load: {error}</div>}

            {!loading && !error && (
                <>
                    <h3 className="text-sm font-medium text-muted m-0 mb-2.5">Running now</h3>
                    <EventTable events={running} localMap={localMap} onImport={importEvent} />

                    <h3 className="text-sm font-medium text-muted mt-6 mb-2.5">Upcoming</h3>
                    <EventTable events={upcoming} localMap={localMap} onImport={importEvent} />
                </>
            )}
        </div>
    );
}
