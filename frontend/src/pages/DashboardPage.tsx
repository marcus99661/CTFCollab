import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getDb, type EventDoc, type ChallengeDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { formatDate } from "../utils";
import { isEventBased } from "../auth";
import "../styles/ui.css";
import "../styles/DashboardPage.css";

type EventGroup = "active" | "upcoming" | "ended" | "nodate";

const EVENT_STATUS: Record<EventGroup, { label: string; color: string }> = {
    active: { label: "Live", color: "#3fb950" },
    upcoming: { label: "Upcoming", color: "#d29922" },
    ended: { label: "Finished", color: "#8b949e" },
    nodate: { label: "Open", color: "#4cb4c7" },
};

function classifyEvent(ev: EventDoc, now: number): EventGroup {
    if (!ev.startAt && !ev.endAt) return "nodate";
    if (ev.startAt && ev.startAt > now) return "upcoming";
    if (ev.endAt && ev.endAt < now) return "ended";
    return "active";
}

function StatCard({ label, value, bg }: { label: string; value: number; bg: string }) {
    return (
        <div className="stat-card" style={{ background: bg }}>
            <div className="stat-card-label">{label}</div>
            <div className="stat-card-value">{value}</div>
        </div>
    );
}

export default function DashboardPage() {
    const [events, setEvents] = useState<EventDoc[]>([]);
    const [challenges, setChallenges] = useState<ChallengeDoc[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        let stopEventSync: (() => void) | null = null;
        let stopChallengeSync: (() => void) | null = null;
        let eventSub: any = null;
        let challengeSub: any = null;

        async function init() {
            const db = await getDb();
            stopEventSync = startEventsAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 10000 });
            stopChallengeSync = startChallengesAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 10000 });

            eventSub = db.events.find().$.subscribe((docs: any[]) => {
                setEvents(
                    docs
                        .map((d: any) => d.toJSON())
                        .filter((d: EventDoc) => !d.isDeleted)
                );
            });

            challengeSub = db.challenges.find().$.subscribe((docs: any[]) => {
                setChallenges(
                    docs
                        .map((d: any) => d.toJSON())
                        .filter((d: ChallengeDoc) => !d.isDeleted)
                );
            });
        }
        init().catch((e) => console.error("DashboardPage init failed:", e));

        return () => {
            eventSub?.unsubscribe();
            challengeSub?.unsubscribe();
            stopEventSync?.();
            stopChallengeSync?.();
        };
    }, []);

    const now = Date.now();
    const active = events.filter(ev => classifyEvent(ev, now) === "active");
    const upcoming = events.filter(ev => classifyEvent(ev, now) === "upcoming").sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0));
    const allSorted = [...events].sort((a, b) => b.updatedAt - a.updatedAt);

    function challengeCount(eventId: string) {
        return challenges.filter(c => c.eventId === eventId).length;
    }

    return (
        <div className="dashboard-page">
            <h2 className="page-title">Dashboard</h2>

            <div className="stat-cards">
                <StatCard label="Events" value={events.length} bg="#4cb4c7" />
                <StatCard label="Currently Active" value={active.length} bg="#e66e12" />
                <StatCard label="Upcoming" value={upcoming.length} bg="#7abecc" />
                <StatCard label="Challenges" value={challenges.length} bg="#018789" />
            </div>

            <div className="dashboard-columns">

                <div className="dashboard-col-left">
                    <h5 className="section-heading">Current</h5>
                    <hr style={{ marginBottom: 16 }} />

                    {active.length === 0 && upcoming.length === 0 ? (
                        <div style={{ color: "var(--muted)", fontSize: 14 }}>No active or upcoming events.</div>
                    ) : (
                        [...active, ...upcoming].map(ev => {
                            const group = classifyEvent(ev, now);
                            const { color } = EVENT_STATUS[group];
                            return (
                                <div
                                    key={ev.id}
                                    className="event-card"
                                    onClick={() => navigate(`/events/${ev.id}`)}
                                    style={{ borderLeft: `3px solid ${color}` }}
                                >
                                    <div className="event-card-name">{ev.name}</div>
                                    <div className="event-card-meta">
                                        {ev.startAt && <span>Start: {formatDate(ev.startAt)}</span>}
                                        {ev.endAt && <span>End: {formatDate(ev.endAt)}</span>}
                                        <span style={{ marginLeft: "auto" }}>{challengeCount(ev.id)} challenges</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="dashboard-col-right">
                    <h5 className="section-heading">Events</h5>
                    <hr style={{ marginBottom: 12 }} />

                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        {!isEventBased() && (
                            <Link to="/events" className="btn btn-primary" style={{ textDecoration: "none" }}>
                                Create Event
                            </Link>
                        )}
                        <Link to="/events" className="btn" style={{ textDecoration: "none" }}>
                            View All
                        </Link>
                    </div>

                    {allSorted.length === 0 ? (
                        <div style={{ color: "var(--muted)", fontSize: 14 }}>No events yet.</div>
                    ) : (
                        <div className="card" style={{ padding: 0 }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Status</th>
                                        <th>Challenges</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allSorted.map(ev => {
                                        const group = classifyEvent(ev, now);
                                        return (
                                            <tr key={ev.id} onClick={() => navigate(`/events/${ev.id}`)} style={{ cursor: "pointer" }}>
                                                <td style={{ fontWeight: 500 }}>{ev.name}</td>
                                                <td><b style={{ color: EVENT_STATUS[group].color }}>{EVENT_STATUS[group].label}</b></td>
                                                <td style={{ color: "var(--muted)" }}>{challengeCount(ev.id)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
