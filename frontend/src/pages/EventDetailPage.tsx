import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getDb, type EventDoc, type ChallengeDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import { makeId } from "../utils";
import { authFetch, getUserIdFromToken } from "../auth";
import "../styles/ui.css";
import "../styles/EventDetailPage.css";

type Member = { user_id: string; username: string; role: string };

// TODO: Replace these hard-coded categories with server provided ENUM
const CATEGORY_COLORS: Record<string, string> = {
    web: "#1d4ed8",
    pwn: "#b91c1c",
    crypto: "#6d28d9",
    reversing: "#c2410c",
    forensic: "#15803d",
    osint: "#0e7490",
    misc: "#374151",
};

function categoryColor(cat: string): string {
    return CATEGORY_COLORS[cat.toLowerCase()] ?? "#374151";
}

function useCountdown(ev: EventDoc | null): string {
    const [text, setText] = useState("");

    useEffect(() => {
        if (!ev) return;

        const tick = () => {
            const now = Date.now();
            if (!ev.startAt && !ev.endAt) { setText(""); return; }

            let target: number;
            let prefix: string;

            if (ev.startAt && ev.startAt > now) {
                target = ev.startAt;
                prefix = "Starts in: ";
            } else if (ev.endAt && ev.endAt > now) {
                target = ev.endAt;
                prefix = "Ends in: ";
            } else {
                setText("Ended");
                return;
            }

            const dist = target - now;
            const d = Math.floor(dist / (24 * 60 * 60 * 1000));
            const h = Math.floor((dist % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const m = Math.floor((dist % (60 * 60 * 1000)) / (60 * 1000));
            const s = Math.floor((dist % (60 * 1000)) / 1000);

            setText(`${prefix}${String(d).padStart(2, "0")}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [ev?.startAt, ev?.endAt]);

    return text;
}

function ChallengeCard({ ch, onDelete }: { ch: ChallengeDoc; onDelete: () => void }) {
    const color = categoryColor(ch.category || "misc");
    const navigate = useNavigate();

    return (
        <div
            className="challenge-card"
            onClick={() => navigate(`/challenges/${ch.id}`)}
            style={{ border: `1px solid ${color}55`, borderLeft: `4px solid ${color}` }}
        >
            <div className="challenge-card-title">{ch.title}</div>
            <div className="challenge-card-meta">
                {ch.points ? <span style={{ color, fontWeight: 600 }}>{ch.points} pts</span> : null}
            </div>
            <div className="challenge-card-footer">
                {ch.url && (
                    <a
                        href={ch.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-text"
                        onClick={e => e.stopPropagation()}
                    >
                        link
                    </a>
                )}
                <button
                    className="btn-text"
                    style={{ marginLeft: "auto" }}
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                >
                    delete
                </button>
            </div>
        </div>
    );
}

function AddChallengeOverlay({ onClose, onAdd }: {
    onClose: () => void;
    onAdd: (title: string, category: string, points: string, url: string) => void;
}) {
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("");
    const [points, setPoints] = useState("");
    const [url, setUrl] = useState("");

    function submit() {
        if (!title.trim()) return;
        onAdd(title, category, points, url);
        onClose();
    }

    return (
        <div className="overlay" onClick={onClose}>
            <div className="overlay-box" onClick={e => e.stopPropagation()}>
                <div className="overlay-box-header">
                    <h5 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>New challenge</h5>
                </div>
                <div className="overlay-box-body">
                    <label className="form-field">
                        <span className="form-field-label">Name</span>
                        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Challenge name" autoFocus />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">Points<span className="form-field-optional">(optional)</span></span>
                        <input className="input" type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="0" />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">Category<span className="form-field-optional">(optional)</span></span>
                        <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Web, Pwn, Crypto..." />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">URL<span className="form-field-optional">(optional)</span></span>
                        <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
                    </label>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={submit} disabled={!title.trim()}>Create</button>
                        <button className="btn" onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function EventDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [event, setEvent] = useState<EventDoc | null>(null);
    const [challenges, setChallenges] = useState<ChallengeDoc[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [syncStatus, setSyncStatus] = useState("Loading...");
    const [members, setMembers] = useState<Member[]>([]);
    const [myRole, setMyRole] = useState<string | null>(null);
    const [inviteUsername, setInviteUsername] = useState("");
    const [inviteError, setInviteError] = useState<string | null>(null);

    const myUserId = getUserIdFromToken();
    const countdown = useCountdown(event);

    useEffect(() => {
        if (!id) return;
        let stopEventSync: (() => void) | null = null;
        let stopChallengeSync: (() => void) | null = null;
        let eventSub: any = null;
        let challengeSub: any = null;

        async function init() {
            const db = await getDb();
            stopEventSync = startEventsAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 8000 });
            stopChallengeSync = startChallengesAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 8000, onStatus: setSyncStatus });
            startNotesAutoSync({ db, baseUrl: "" });

            eventSub = db.events.findOne(id).$.subscribe((doc: any) => {
                if (!doc) { setEvent(null); return; }
                const data = doc.toJSON();
                if (data.isDeleted) { navigate("/events"); return; }
                setEvent(data);
            });

            challengeSub = db.challenges.find({ selector: { eventId: id } }).$.subscribe((docs: any[]) => {
                setChallenges(
                    docs
                        .map((d: any) => d.toJSON())
                        .filter((d: ChallengeDoc) => !d.isDeleted)
                        .sort((a: ChallengeDoc, b: ChallengeDoc) => a.title.localeCompare(b.title))
                );
            });

            setSyncStatus("Ready");
            fetchMembers();
        }
        init().catch((e) => {
            console.error("EventDetailPage init failed:", e);
            setSyncStatus("Init failed");
        });

        return () => {
            eventSub?.unsubscribe();
            challengeSub?.unsubscribe();
            stopEventSync?.();
            stopChallengeSync?.();
        };
    }, [id]);

    async function createChallenge(title: string, category: string, points: string, url: string) {
        if (!title.trim() || !id) return;
        try {
            const db = await getDb();
            const noteId = makeId();
            await db.notes.insert({ id: noteId, title: title.trim(), updatedAt: Date.now(), isDeleted: false });
            await db.challenges.insert({
                id: makeId(),
                eventId: id,
                title: title.trim(),
                category: category.trim(),
                points: Number(points) || 0,
                url: url.trim(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
                noteId,
            });
        } catch (e) {
            console.error("createChallenge failed:", e);
        }
    }

    async function deleteChallenge(cid: string) {
        try {
            const db = await getDb();
            const doc = await db.challenges.findOne(cid).exec();
            if (!doc) return;
            await doc.patch({ isDeleted: true, updatedAt: Date.now() });
        } catch (e) {
            console.error("deleteChallenge failed:", e);
        }
    }

    async function fetchMembers(retry = true) {
        if (!id) return;
        try {
            const res = await authFetch(`/api/events/${id}/members`);
            if (!res.ok) return;
            const list: Member[] = await res.json();
            if (list.length === 0 && retry) {
                setTimeout(() => fetchMembers(false), 2000);
                return;
            }
            setMembers(list);
            const me = list.find(m => m.user_id === myUserId);
            setMyRole(me?.role ?? null);
        } catch {}
    }

    async function inviteMember() {
        if (!id || !inviteUsername.trim()) return;
        setInviteError(null);
        try {
            const res = await authFetch(`/api/events/${id}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: inviteUsername.trim() }),
            });
            const json = await res.json();
            if (!res.ok) { setInviteError(json.error ?? "Failed to invite"); return; }
            setInviteUsername("");
            fetchMembers();
        } catch { setInviteError("Could not reach server"); }
    }

    async function kickMember(userId: string) {
        if (!id) return;
        try {
            await authFetch(`/api/events/${id}/members/${userId}`, { method: "DELETE" });
            fetchMembers();
        } catch {}
    }

    const byCategory: Record<string, ChallengeDoc[]> = {};
    for (const ch of challenges) {
        const cat = ch.category || "Misc";
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(ch);
    }

    const totalPoints = challenges.reduce((sum, c) => sum + (c.points || 0), 0);
    const owner = members.find(m => m.role === "owner");

    return (
        <div className="event-page">
            <div style={{ marginBottom: 20 }}>
                <Link to="/events" className="back-link">&lt; Events</Link>
            </div>

            {event ? (
                <>
                    <div className="event-page-header">
                        <h1 className="event-page-title">{event.name}</h1>
                        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                            Add challenge
                        </button>
                    </div>

                    <div className="event-info-row">
                        {countdown && <span>{countdown}</span>}
                        {owner && <span>Created by {owner.username}</span>}
                        <span>{challenges.length} challenges</span>
                        {totalPoints > 0 && <span>{totalPoints} pts total</span>}
                    </div>

                    <div className="panel" style={{ marginBottom: 20 }}>
                        <div className="panel-header">Members ({members.length})</div>
                        <div className="panel-body">
                            {members.map(m => (
                                <div key={m.user_id} className="member-row">
                                    <span className="member-name">{m.username}</span>
                                    <span className={`member-role ${m.role === "owner" ? "member-role--owner" : ""}`}>
                                        {m.role}
                                    </span>
                                    {myRole === "owner" && m.user_id !== myUserId && (
                                        <button className="btn-text" onClick={() => kickMember(m.user_id)}>
                                            kick
                                        </button>
                                    )}
                                </div>
                            ))}

                            {myRole === "owner" && (
                                <div className="invite-row">
                                    <input
                                        className="input"
                                        value={inviteUsername}
                                        onChange={e => setInviteUsername(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") inviteMember(); }}
                                        placeholder="Username"
                                    />
                                    <button className="btn btn-primary" onClick={inviteMember} disabled={!inviteUsername.trim()}>
                                        Invite
                                    </button>
                                </div>
                            )}
                            {inviteError && <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{inviteError}</p>}
                        </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <div className="status-bar">
                            <span className="dot" />
                            <span>{syncStatus}</span>
                        </div>
                    </div>

                    {challenges.length === 0 ? (
                        <div className="empty-state">No challenges yet.</div>
                    ) : (
                        Object.entries(byCategory)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([cat, chals]) => (
                                <div key={cat} className="category-section">
                                    <h2 className="category-heading" style={{ color: categoryColor(cat) }}>
                                        {cat}
                                    </h2>
                                    <div className="challenge-grid">
                                        {chals.map(ch => (
                                            <ChallengeCard key={ch.id} ch={ch} onDelete={() => deleteChallenge(ch.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))
                    )}
                </>
            ) : (
                <div className="empty-state">Event not found.</div>
            )}

            {showForm && (
                <AddChallengeOverlay
                    onClose={() => setShowForm(false)}
                    onAdd={createChallenge}
                />
            )}
        </div>
    );
}
