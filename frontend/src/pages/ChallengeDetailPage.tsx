import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getDb, type ChallengeDoc, type EventDoc } from "../db";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import { getCollabUser, authFetch, getUserIdFromToken } from "../auth";
import NoteEditor from "../components/NoteEditor";
import "../styles/ui.css";

export default function ChallengeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [challenge, setChallenge] = useState<ChallengeDoc | null>(null);
    const [flagFormat, setFlagFormat] = useState("");
    const [isOwner, setIsOwner] = useState(false);
    const [flagInput, setFlagInput] = useState("");
    const [showEdit, setShowEdit] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        let stopChallengeSync: (() => void) | null = null;
        let stopNotesSync: (() => void) | null = null;
        let sub: any = null;

        async function init() {
            const db = await getDb();
            stopChallengeSync = startChallengesAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 8000 });
            stopNotesSync = startNotesAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 8000 });

            sub = db.challenges.findOne(id).$.subscribe(async (doc: any) => {
                if (!doc) { setChallenge(null); return; }
                const data = doc.toJSON();
                setChallenge(data);
                setFlagInput(data.flag ?? "");
                const eventDoc = await db.events.findOne(data.eventId).exec();
                if (eventDoc) {
                    const ev = eventDoc.toJSON() as EventDoc;
                    setFlagFormat(ev.flagFormat ?? "");
                    setIsOwner(ev.createdBy === getUserIdFromToken());
                }
            });
        }
        init().catch(console.error);

        return () => {
            sub?.unsubscribe();
            stopChallengeSync?.();
            stopNotesSync?.();
        };
    }, [id]);

    async function joinSolvers() {
        if (!id || !challenge) return;
        const username = getCollabUser()?.name;
        if (!username) return;
        const db = await getDb();

        // Remove self from any other challenge in the same event
        const others = await db.challenges.find({ selector: { eventId: challenge.eventId, isDeleted: false } }).exec();
        for (const other of others) {
            const data = other.toJSON();
            if (data.id !== id && (data.solvers ?? []).includes(username)) {
                await other.patch({ solvers: (data.solvers ?? []).filter((s: string) => s !== username), updatedAt: Date.now() });
            }
        }

        // Add self to this challenge
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;
        const current = doc.toJSON();
        if (!(current.solvers ?? []).includes(username)) {
            await doc.patch({ solvers: [...(current.solvers ?? []), username], updatedAt: Date.now() });
        }
    }

    async function leaveSolvers() {
        if (!id) return;
        const username = getCollabUser()?.name;
        if (!username) return;
        const db = await getDb();
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;
        const current = doc.toJSON();
        await doc.patch({ solvers: (current.solvers ?? []).filter((s: string) => s !== username), updatedAt: Date.now() });
    }

    async function markSolved() {
        if (!id || !flagInput.trim()) return;
        const db = await getDb();
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;
        await doc.patch({
            solved: true,
            flag: flagInput.trim(),
            solvedBy: getCollabUser()?.name ?? null,
            solvers: [],
            updatedAt: Date.now(),
        });
    }

    async function unsolve() {
        if (!id) return;
        const db = await getDb();
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;
        await doc.patch({ solved: false, flag: null, solvedBy: null, updatedAt: Date.now() });
        setFlagInput("");
    }

    async function editChallenge(title: string, category: string, points: string, url: string) {
        if (!id) return;
        const db = await getDb();
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;
        await doc.patch({
            title: title.trim(),
            category: category.trim(),
            points: Number(points) || 0,
            url: url.trim(),
            updatedAt: Date.now(),
        });
    }

    async function deleteChallenge() {
        if (!id || !challenge) return;
        if (!confirm(`Delete "${challenge.title}"? This cannot be undone.`)) return;
        const db = await getDb();
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;
        await doc.patch({ isDeleted: true, updatedAt: Date.now() });
        navigate(`/events/${challenge.eventId}`);
    }

    async function syncFromCtfd() {
        if (!challenge?.ctfdId) return;
        setSyncing(true);
        setSyncError(null);
        try {
            const res = await authFetch(`/api/events/${challenge.eventId}/ctfd/challenges/${challenge.ctfdId}`);
            const json = await res.json();
            if (!res.ok) { setSyncError(json.error ?? "Failed to sync"); return; }
            const db = await getDb();
            const doc = await db.challenges.findOne(id).exec();
            if (!doc) return;
            await doc.patch({
                points: json.value,
                description: json.description,
                category: json.category,
                updatedAt: Date.now(),
            });
        } catch (e: any) {
            setSyncError(e.message);
        } finally {
            setSyncing(false);
        }
    }

    if (!challenge) {
        return <div className="text-muted text-sm py-8 text-center">Challenge not found.</div>;
    }

    function EditChallengeOverlay({ onClose }: { onClose: () => void }) {
        const [title, setTitle] = useState(challenge!.title);
        const [category, setCategory] = useState(challenge!.category);
        const [points, setPoints] = useState(String(challenge!.points || ""));
        const [url, setUrl] = useState(challenge!.url);

        function submit() {
            if (!title.trim()) return;
            editChallenge(title, category, points, url);
            onClose();
        }

        return (
            <div className="overlay" onClick={onClose}>
                <div className="overlay-box" onClick={e => e.stopPropagation()}>
                    <div className="overlay-box-header">
                        <h5 className="m-0 text-[15px] font-semibold">Edit challenge</h5>
                    </div>
                    <div className="overlay-box-body">
                        <label className="form-field">
                            <span className="form-field-label">Name</span>
                            <input className="input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
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
                            <button className="btn btn-primary" onClick={submit} disabled={!title.trim()}>Save</button>
                            <button className="btn" onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-52px)]">
            <div className="px-5 py-2.5 border-b border-border flex items-center gap-4 shrink-0">
                <Link to={`/events/${challenge.eventId}`} className="text-accent no-underline text-sm hover:underline">&lt; Back</Link>
                <span className="font-semibold text-base text-text">{challenge.title}</span>
                {challenge.category && (
                    <span className="text-xs text-muted">{challenge.category}</span>
                )}
                {challenge.points > 0 && (
                    <span className="points-badge">{challenge.points} pts</span>
                )}
                <div className="ml-auto flex items-center gap-3">
                    {challenge.ctfdId && (
                        <button className="btn" onClick={syncFromCtfd} disabled={syncing}>
                            {syncing ? "Syncing..." : "Sync from CTFd"}
                        </button>
                    )}
                    {isOwner && (
                        <>
                            <button className="btn" onClick={() => setShowEdit(true)}>Edit</button>
                            <button className="btn btn-danger" onClick={deleteChallenge}>Delete</button>
                        </>
                    )}
                    {challenge.url && (
                        <a href={challenge.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent no-underline hover:underline">
                            link
                        </a>
                    )}
                </div>
            </div>
            {showEdit && <EditChallengeOverlay onClose={() => setShowEdit(false)} />}

            <div className="flex-1 flex overflow-hidden gap-4 p-4">
                <div className="w-[260px] shrink-0 overflow-auto border border-border rounded-md">
                    <div className="p-3 flex flex-col gap-3">
                        {syncError && <p className="text-danger text-[13px] m-0">{syncError}</p>}
                        {challenge.description && (
                            <div className="text-[13px] text-text whitespace-pre-wrap border-b border-border pb-3">{challenge.description}</div>
                        )}
                        {(() => {
                            const username = getCollabUser()?.name;
                            const solvers = challenge.solvers ?? [];
                            const isSolving = username ? solvers.includes(username) : false;
                            return !challenge.solved && (
                                <div className="flex flex-col gap-2 pb-3 border-b border-border">
                                    <div className="text-xs text-muted">
                                        {solvers.length > 0 ? `Working on it: ${solvers.join(", ")}` : "Nobody working on this"}
                                    </div>
                                    {isSolving ? (
                                        <button className="btn" onClick={leaveSolvers}>Leave</button>
                                    ) : (
                                        <button className="btn btn-primary" onClick={joinSolvers}>Assign</button>
                                    )}
                                </div>
                            );
                        })()}

                        {challenge.solved ? (
                            <>
                                <div className="bg-success/10 border border-success rounded-md px-3 py-2 text-success font-semibold text-sm">
                                    ✓ Solved
                                </div>
                                {challenge.solvedBy && (
                                    <div className="text-xs text-muted">by {challenge.solvedBy}</div>
                                )}
                                <input
                                    className="input font-mono text-[13px]"
                                    readOnly
                                    value={challenge.flag ?? ""}
                                />
                                <button className="btn" onClick={unsolve}>Unsolve</button>
                            </>
                        ) : (
                            <>
                                <label className="form-field">
                                    <span className="form-field-label">Flag</span>
                                    <input
                                        className="input font-mono text-[13px]"
                                        value={flagInput}
                                        onChange={e => setFlagInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") markSolved(); }}
                                        placeholder={flagFormat || "flag{...}"}
                                        autoFocus
                                    />
                                </label>
                                <button
                                    className="btn btn-primary"
                                    onClick={markSolved}
                                    disabled={!flagInput.trim()}
                                >
                                    Mark as solved
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto border border-border rounded-md px-4 py-3">
                    {challenge.noteId
                        ? <NoteEditor key={challenge.noteId} noteId={challenge.noteId} eventId={challenge.eventId} downloadName={challenge.title} />
                        : <div className="text-muted text-sm py-8 text-center">No note attached to this challenge.</div>
                    }
                </div>
            </div>
        </div>
    );
}
