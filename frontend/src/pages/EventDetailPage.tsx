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

interface EventInvite {
    token: string;
    max_uses: number | null;
    uses: number;
    expires_at: number | null;
    event_based: boolean;
}

interface InviteJoin {
    username: string;
    joined_at: number;
}

function InviteOverlay({ eventId, onClose }: { eventId: string; onClose: () => void }) {
    const [invite, setInvite] = useState<EventInvite | null | undefined>(undefined);
    const [joins, setJoins] = useState<InviteJoin[]>([]);
    const [maxUses, setMaxUses] = useState("");
    const [expiresHours, setExpiresHours] = useState("");
    const [expiresMinutes, setExpiresMinutes] = useState("");
    const [eventBased, setEventBased] = useState(true);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function refresh() {
        try {
            const [inviteRes, joinsRes] = await Promise.all([
                authFetch(`/api/events/${eventId}/invite`),
                authFetch(`/api/events/${eventId}/invite/joins`),
            ]);
            setInvite(inviteRes.ok ? await inviteRes.json() : null);
            if (joinsRes.ok) setJoins(await joinsRes.json());
        } catch {
            setInvite(null);
        }
    }

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 5000);
        return () => clearInterval(id);
    }, [eventId]);

    async function createInvite() {
        setError(null);
        const totalMinutes = (parseInt(expiresHours) || 0) * 60 + (parseInt(expiresMinutes) || 0);
        const body: any = { event_based: eventBased };
        if (maxUses.trim()) body.max_uses = parseInt(maxUses);
        if (totalMinutes > 0) body.expires_in_minutes = totalMinutes;

        const res = await authFetch(`/api/events/${eventId}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            await refresh();
        } else {
            setError("Failed to create invite");
        }
    }

    async function deleteInvite() {
        await authFetch(`/api/events/${eventId}/invite`, { method: "DELETE" });
        await refresh();
    }

    function copyLink() {
        if (!invite) return;
        navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function formatExpiry(ts: number) {
        const diff = ts - Date.now();
        if (diff <= 0) return "Expired";
        const h = Math.floor(diff / (60 * 60 * 1000));
        const m = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
        return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
    }

    return (
        <div className="overlay" onClick={onClose}>
            <div className="overlay-box" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
                <div className="overlay-box-header">
                    <h5 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Invite link</h5>
                </div>
                <div className="overlay-box-body">
                    {invite === undefined && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</div>}

                    {invite === null && (
                        <>
                            <label className="form-field">
                                <span className="form-field-label">Max uses<span className="form-field-optional">(optional)</span></span>
                                <input className="input" type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited" />
                            </label>
                            <div className="form-field">
                                <span className="form-field-label">Expires in<span className="form-field-optional">(optional)</span></span>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input className="input" type="number" value={expiresHours} onChange={e => setExpiresHours(e.target.value)} placeholder="Hours" style={{ flex: 1 }} />
                                    <input className="input" type="number" value={expiresMinutes} onChange={e => setExpiresMinutes(e.target.value)} placeholder="Minutes" style={{ flex: 1 }} />
                                </div>
                            </div>
                            <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={eventBased} onChange={e => setEventBased(e.target.checked)} />
                                <span title="Account can only access events they were invited to. Cannot create new events." style={{ fontSize: 13, cursor: "help", borderBottom: "1px dotted var(--muted)" }}>Event-based account</span>
                            </label>
                            {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{error}</p>}
                            <div className="form-actions">
                                <button className="btn btn-primary" onClick={createInvite}>Create invite</button>
                                <button className="btn" onClick={onClose}>Cancel</button>
                            </div>
                        </>
                    )}

                    {invite && (
                        <>
                            <div className="form-field">
                                <span className="form-field-label">Link</span>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        className="input"
                                        readOnly
                                        value={`${window.location.origin}/invite/${invite.token}`}
                                        style={{ flex: 1, cursor: "text" }}
                                    />
                                    <button className="btn" onClick={copyLink}>
                                        {copied ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 16 }}>
                                <span>Uses: {invite.uses}{invite.max_uses != null ? ` / ${invite.max_uses}` : ""}</span>
                                {invite.expires_at && <span>{formatExpiry(invite.expires_at)}</span>}
                                <span>{invite.event_based ? "Event-based" : "Full account"}</span>
                            </div>

                            {joins.length > 0 && (
                                <div className="panel" style={{ marginTop: 4 }}>
                                    <div className="panel-header">Joined via invite</div>
                                    <div className="panel-body" style={{ gap: 6 }}>
                                        {joins.map((j, i) => (
                                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                                <span>{j.username}</span>
                                                <span style={{ color: "var(--muted)" }}>{new Date(j.joined_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false })}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-actions" style={{ marginTop: 4 }}>
                                <button className="btn btn-danger" onClick={deleteInvite}>Delete invite</button>
                                <button className="btn" onClick={onClose}>Close</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

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
    const [showInvite, setShowInvite] = useState(false);
    const [syncStatus, setSyncStatus] = useState("Loading...");
    const [members, setMembers] = useState<Member[]>([]);
    const [myRole, setMyRole] = useState<string | null>(null);
    const [inviteUsername, setInviteUsername] = useState("");
    const [inviteError, setInviteError] = useState<string | null>(null);

    const myUserId = getUserIdFromToken();
    const countdown = useCountdown(event);

    // If members haven't synced yet but the event exists locally, get role from createdBy
    const effectiveRole = myRole ?? (event?.createdBy === myUserId ? "owner" : null);

    useEffect(() => {
        if (!id) return;
        let stopEventSync: (() => void) | null = null;
        let stopChallengeSync: (() => void) | null = null;
        let eventSub: any = null;
        let challengeSub: any = null;

        async function init() {
            const db = await getDb();
            let membersLoaded = false;
            stopEventSync = startEventsAutoSync({
                db, baseUrl: "", debounceMs: 900, pollMs: 8000,
                onStatus: (status) => {
                    if (status === "Synced" && !membersLoaded) {
                        membersLoaded = true;
                        fetchMembers();
                    }
                },
            });
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

    async function fetchMembers() {
        if (!id) return;
        try {
            const res = await authFetch(`/api/events/${id}/members`);
            if (!res.ok) return;
            const list: Member[] = await res.json();
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
                        {effectiveRole === "owner" && (
                            <button className="btn" onClick={() => setShowInvite(true)}>
                                Invite link
                            </button>
                        )}
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
                                    {effectiveRole === "owner" && m.user_id !== myUserId && (
                                        <button className="btn-text" onClick={() => kickMember(m.user_id)}>
                                            kick
                                        </button>
                                    )}
                                </div>
                            ))}

                            {effectiveRole === "owner" && (
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
            {showInvite && id && (
                <InviteOverlay eventId={id} onClose={() => setShowInvite(false)} />
            )}
        </div>
    );
}
