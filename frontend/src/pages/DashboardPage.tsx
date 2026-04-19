import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getDb, type EventDoc, type ChallengeDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { formatDate } from "../utils";
import { isEventBased } from "../auth";
import "../styles/ui.css";

type EventGroup = "active" | "upcoming" | "ended" | "nodate";

const EVENT_STATUS: Record<EventGroup, { label: string; color: string }> = {
    active: { label: "Live", color: "var(--color-success)" },
    upcoming: { label: "Upcoming", color: "var(--color-warning)" },
    ended: { label: "Finished", color: "var(--color-muted)" },
    nodate: { label: "Open", color: "var(--color-accent)" },
};

function classifyEvent(ev: EventDoc, now: number): EventGroup {
    if (!ev.startAt && !ev.endAt) return "nodate";
    if (ev.startAt && ev.startAt > now) return "upcoming";
    if (ev.endAt && ev.endAt < now) return "ended";
    return "active";
}

function StatCard({ label, value, bg }: { label: string; value: number; bg: string }) {
    return (
        <div className="flex-[1_1_140px] rounded-md text-center overflow-hidden text-white" style={{ background: bg }}>
            <div className="py-2 border-b border-white/20 text-[13px] font-semibold">{label}</div>
            <div className="py-4 text-[32px] font-bold">{value}</div>
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
        <div className="max-w-[1100px] mx-auto my-8 px-6">
            <h2 className="text-text font-semibold text-xl m-0 mb-5">Dashboard</h2>

            <div className="flex gap-3 flex-wrap mb-7">
                <StatCard label="Events" value={events.length} bg="var(--color-accent)" />
                <StatCard label="Currently Active" value={active.length} bg="var(--color-warning)" />
                <StatCard label="Upcoming" value={upcoming.length} bg="#7abecc" />
                <StatCard label="Challenges" value={challenges.length} bg="#018789" />
            </div>

            <div className="flex gap-6 flex-wrap items-start">

                <div className="flex-[1_1_280px] min-w-0">
                    <h5 className="text-text m-0 mb-2 text-sm font-semibold">Current</h5>
                    <hr className="mb-4" />

                    {active.length === 0 && upcoming.length === 0 ? (
                        <div className="text-muted text-sm">No active or upcoming events.</div>
                    ) : (
                        [...active, ...upcoming].map(ev => {
                            const group = classifyEvent(ev, now);
                            const { color } = EVENT_STATUS[group];
                            return (
                                <div
                                    key={ev.id}
                                    className="bg-surface border border-border rounded-md px-4 py-3 mb-2 cursor-pointer hover:bg-surface-2"
                                    onClick={() => navigate(`/events/${ev.id}`)}
                                    style={{ borderLeft: `3px solid ${color}` }}
                                >
                                    <div className="font-semibold text-sm text-text mb-1">{ev.name}</div>
                                    <div className="text-xs text-muted flex gap-4 flex-wrap">
                                        {ev.startAt && <span>Start: {formatDate(ev.startAt)}</span>}
                                        {ev.endAt && <span>End: {formatDate(ev.endAt)}</span>}
                                        <span className="ml-auto">{challengeCount(ev.id)} challenges</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex-[2_1_380px] min-w-0">
                    <h5 className="text-text m-0 mb-2 text-sm font-semibold">Events</h5>
                    <hr className="mb-3" />

                    <div className="flex gap-2 mb-3">
                        {!isEventBased() && (
                            <Link to="/events" className="btn btn-primary no-underline">
                                Create Event
                            </Link>
                        )}
                        <Link to="/events" className="btn no-underline">
                            View All
                        </Link>
                    </div>

                    {allSorted.length === 0 ? (
                        <div className="text-muted text-sm">No events yet.</div>
                    ) : (
                        <div className="card p-0">
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
                                            <tr key={ev.id} onClick={() => navigate(`/events/${ev.id}`)} className="cursor-pointer">
                                                <td className="font-medium">{ev.name}</td>
                                                <td><b style={{ color: EVENT_STATUS[group].color }}>{EVENT_STATUS[group].label}</b></td>
                                                <td className="text-muted">{challengeCount(ev.id)}</td>
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
