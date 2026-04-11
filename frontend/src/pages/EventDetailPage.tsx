import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getDb, type EventDoc, type ChallengeDoc } from "../db";
import { startEventsAutoSync } from "../sync/eventsSync";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import { makeId } from "../utils";
import { authFetch, getUserIdFromToken } from "../auth";
import "../styles/ui.css";

type Member = { user_id: string; username: string; role: string };

interface PlacementInfo {
    pos: number;
    score: number;
    above_gap: number | null;
    below_gap: number | null;
    team_count: number;
}

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
            <div className="overlay-box w-[480px]" onClick={e => e.stopPropagation()}>
                <div className="overlay-box-header">
                    <h5 className="m-0 text-[15px] font-semibold">Invite link</h5>
                </div>
                <div className="overlay-box-body">
                    {invite === undefined && <div className="text-muted text-[13px]">Loading...</div>}

                    {invite === null && (
                        <>
                            <label className="form-field">
                                <span className="form-field-label">Max uses<span className="form-field-optional">(optional)</span></span>
                                <input className="input" type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited" />
                            </label>
                            <div className="form-field">
                                <span className="form-field-label">Expires in<span className="form-field-optional">(optional)</span></span>
                                <div className="flex gap-2">
                                    <input className="input flex-1" type="number" value={expiresHours} onChange={e => setExpiresHours(e.target.value)} placeholder="Hours" />
                                    <input className="input flex-1" type="number" value={expiresMinutes} onChange={e => setExpiresMinutes(e.target.value)} placeholder="Minutes" />
                                </div>
                            </div>
                            <label className="form-field flex-row items-center gap-2">
                                <input type="checkbox" checked={eventBased} onChange={e => setEventBased(e.target.checked)} />
                                <span title="Account can only access events they were invited to. Cannot create new events." className="text-[13px] cursor-help border-b border-dotted border-muted">Event-based account</span>
                            </label>
                            {error && <p className="text-danger m-0 text-[13px]">{error}</p>}
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
                                <div className="flex gap-2">
                                    <input
                                        className="input flex-1"
                                        readOnly
                                        value={`${window.location.origin}/invite/${invite.token}`}
                                    />
                                    <button className="btn" onClick={copyLink}>
                                        {copied ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                            </div>
                            <div className="text-[13px] text-muted flex gap-4">
                                <span>Uses: {invite.uses}{invite.max_uses != null ? ` / ${invite.max_uses}` : ""}</span>
                                {invite.expires_at && <span>{formatExpiry(invite.expires_at)}</span>}
                                <span>{invite.event_based ? "Event-based" : "Full account"}</span>
                            </div>

                            {joins.length > 0 && (
                                <div className="panel mt-1">
                                    <div className="panel-header">Joined via invite</div>
                                    <div className="panel-body gap-1.5">
                                        {joins.map((j, i) => (
                                            <div key={i} className="flex justify-between text-[13px]">
                                                <span>{j.username}</span>
                                                <span className="text-muted">{new Date(j.joined_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false })}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-actions mt-1">
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
    const key = cat.toLowerCase();
    if (CATEGORY_COLORS[key]) return CATEGORY_COLORS[key];
    let h = 0;
    for (let i = 0; i < key.length; i++) {
        h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
    }
    return `hsl(${Math.abs(h) % 360}, 60%, 55%)`;
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

    const statusBg = ch.solved
        ? "rgba(63, 185, 80, 0.15)"
        : (ch.solvers && ch.solvers.length > 0)
            ? "rgba(210, 153, 34, 0.15)"
            : "rgba(139, 148, 158, 0.1)";

    return (
        <div
            className="rounded-md p-3.5 flex flex-col gap-2 cursor-pointer"
            onClick={() => navigate(`/challenges/${ch.id}`)}
            style={{
                background: statusBg,
                borderLeft: `4px solid ${color}`,
            }}
        >
            <div className="text-[15px] font-semibold text-text leading-tight">{ch.title}</div>
            <div className="text-[13px]">
                {ch.points ? <span style={{ color, fontWeight: 600 }}>{ch.points} pts</span> : null}
            </div>
            {ch.solved && ch.solvedBy && (
                <div className="text-muted text-xs">by {ch.solvedBy}</div>
            )}
            {!ch.solved && ch.solvers && ch.solvers.length > 0 && (
                <div className="text-muted text-xs">{ch.solvers.join(", ")}</div>
            )}
            <div className="flex gap-2 flex-wrap mt-auto items-center">
                {ch.ctfdId && Date.now() - ch.createdAt < 30 * 60 * 1000 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent">New</span>
                )}
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
                    className="btn-text ml-auto"
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                >
                    delete
                </button>
            </div>
        </div>
    );
}

function tsToDatetimeLocal(ts: number | null | undefined): string {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditEventOverlay({ event, onClose, onSave }: {
    event: EventDoc;
    onClose: () => void;
    onSave: (name: string, description: string, flagFormat: string, startAt: string, endAt: string) => void;
}) {
    const [name, setName] = useState(event.name);
    const [description, setDescription] = useState(event.description);
    const [flagFormat, setFlagFormat] = useState(event.flagFormat ?? "");
    const [startAt, setStartAt] = useState(tsToDatetimeLocal(event.startAt));
    const [endAt, setEndAt] = useState(tsToDatetimeLocal(event.endAt));

    function submit() {
        if (!name.trim()) return;
        onSave(name, description, flagFormat, startAt, endAt);
        onClose();
    }

    return (
        <div className="overlay" onClick={onClose}>
            <div className="overlay-box" onClick={e => e.stopPropagation()}>
                <div className="overlay-box-header">
                    <h5 className="m-0 text-[15px] font-semibold">Edit event</h5>
                </div>
                <div className="overlay-box-body">
                    <label className="form-field">
                        <span className="form-field-label">Name</span>
                        <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">Description<span className="form-field-optional">(optional)</span></span>
                        <input className="input" value={description} onChange={e => setDescription(e.target.value)} />
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
                        <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>Save</button>
                        <button className="btn" onClick={onClose}>Cancel</button>
                    </div>
                </div>
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
                    <h5 className="m-0 text-[15px] font-semibold">New challenge</h5>
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
    const [showEdit, setShowEdit] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [syncStatus, setSyncStatus] = useState("Loading...");
    const [members, setMembers] = useState<Member[]>([]);
    const [myRole, setMyRole] = useState<string | null>(null);
    const [inviteUsername, setInviteUsername] = useState("");
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [placement, setPlacement] = useState<PlacementInfo | null>(null);

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
            fetchPlacement();
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


    async function editEvent(name: string, description: string, flagFormat: string, startAt: string, endAt: string) {
        if (!id) return;
        try {
            const db = await getDb();
            const doc = await db.events.findOne(id).exec();
            if (!doc) return;
            await doc.patch({
                name: name.trim(),
                description: description.trim(),
                flagFormat: flagFormat.trim(),
                startAt: startAt ? new Date(startAt).getTime() : null,
                endAt: endAt ? new Date(endAt).getTime() : null,
                updatedAt: Date.now(),
            });
        } catch (e) {
            console.error("editEvent failed:", e);
        }
    }

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
                solved: false,
                flag: null,
                solvedBy: null,
                solvers: [],
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

    async function fetchPlacement() {
        if (!id) return;
        try {
            const res = await authFetch(`/api/events/${id}/ctfd/placement`);
            if (!res.ok) return;
            setPlacement(await res.json());
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
        <div className="max-w-[1100px] mx-auto my-8 px-6">
            <div className="mb-5">
                <Link to="/events" className="text-accent no-underline text-sm hover:underline">&lt; Events</Link>
            </div>

            {event ? (
                <>
                    <div className="flex items-baseline gap-4 mb-5">
                        <h1 className="m-0 text-[22px] font-bold flex-1">{event.name}</h1>
                        {effectiveRole === "owner" && (
                            <>
                                <button className="btn" onClick={() => setShowEdit(true)}>Edit</button>
                                <button className="btn" onClick={() => setShowInvite(true)}>Invite link</button>
                            </>
                        )}
                        <Link to={`/events/${id}/ctfd`} className="btn no-underline">CTFd</Link>
                        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                            Add challenge
                        </button>
                    </div>

                    <div className="flex gap-5 flex-wrap mb-6 text-sm text-muted">
                        {countdown && <span>{countdown}</span>}
                        {owner && <span>Created by {owner.username}</span>}
                        <span>{challenges.length} challenges</span>
                        {totalPoints > 0 && <span>{totalPoints} pts total</span>}
                    </div>

                    {placement && (
                        <div className="flex gap-4 flex-wrap items-baseline mb-6 text-sm">
                            <span className="font-bold text-text text-base">#{placement.pos}</span>
                            <span className="text-muted">of {placement.team_count} teams</span>
                            <span className="text-muted">{placement.score} pts</span>
                            {placement.above_gap !== null && (
                                <span className="text-muted">+{placement.above_gap} pts to #{placement.pos - 1}</span>
                            )}
                            {placement.below_gap !== null && (
                                <span className="text-muted">{placement.below_gap} pts ahead of #{placement.pos + 1}</span>
                            )}
                        </div>
                    )}

                    <div className="panel mb-5">
                        <div className="panel-header">Members ({members.length})</div>
                        <div className="panel-body">
                            {members.map(m => (
                                <div key={m.user_id} className="flex items-center gap-2.5">
                                    <span className="text-sm flex-1">{m.username}</span>
                                    <span className={`text-xs ${m.role === "owner" ? "text-accent" : "text-muted"}`}>
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
                                <div className="flex gap-2 mt-1 border-t border-border pt-2.5">
                                    <input
                                        className="input flex-1"
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
                            {inviteError && <p className="text-danger m-0 text-[13px]">{inviteError}</p>}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted mb-5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted inline-block shrink-0" />
                        <span>{syncStatus}</span>
                    </div>

                    {challenges.length === 0 ? (
                        <div className="text-muted text-sm py-8 text-center">No challenges yet.</div>
                    ) : (
                        Object.entries(byCategory)
                            .sort(([a], [b]) => b.localeCompare(a))
                            .map(([cat, chals]) => (
                                <div key={cat} className="mb-8">
                                    <h2 className="m-0 mb-3 text-base font-semibold capitalize" style={{ color: categoryColor(cat) }}>
                                        {cat}
                                    </h2>
                                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                                        {chals.map(ch => (
                                            <ChallengeCard key={ch.id} ch={ch} onDelete={() => deleteChallenge(ch.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))
                    )}
                </>
            ) : (
                <div className="text-muted text-sm py-8 text-center">Event not found.</div>
            )}

            {showEdit && event && (
                <EditEventOverlay
                    event={event}
                    onClose={() => setShowEdit(false)}
                    onSave={editEvent}
                />
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
