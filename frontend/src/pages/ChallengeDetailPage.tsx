import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getDb, type ChallengeDoc, type EventDoc } from "../db";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import { getCollabUser, authFetch, getUserIdFromToken } from "../auth";
import { downloadBlob } from "../utils";
import NoteEditor from "../components/NoteEditor";
import "../styles/ui.css";

type ChallengeFile = {
    id: string;
    challengeId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    source: string;
    uploadedBy: string | null;
    createdAt: number;
};

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EditChallengeOverlay({ challenge, onClose, onSave }: {
    challenge: ChallengeDoc;
    onClose: () => void;
    onSave: (title: string, category: string, points: string, url: string, description: string) => void;
}) {
    const [title, setTitle] = useState(challenge.title);
    const [category, setCategory] = useState(challenge.category);
    const [points, setPoints] = useState(String(challenge.points || ""));
    const [url, setUrl] = useState(challenge.url);
    const [description, setDescription] = useState(challenge.description ?? "");

    function submit() {
        if (!title.trim()) return;

        onSave(title, category, points, url, description);
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
                    <label className="form-field">
                        <span className="form-field-label">Description<span className="form-field-optional">(optional)</span></span>
                        <textarea
                            className="input"
                            rows={4}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            style={{ height: "auto", padding: "7px 12px", resize: "vertical" }}
                        />
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

function ChallengeFiles({ challengeId, canDelete }: { challengeId: string; canDelete: boolean }) {
    const [files, setFiles] = useState<ChallengeFile[] | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const myId = getUserIdFromToken();

    async function refresh() {
        const res = await authFetch(`/api/challenges/${challengeId}/files`);

        if (!res.ok) return;

        setFiles(await res.json());
    }

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 15000);
        return () => clearInterval(id);
    }, [challengeId]);

    async function upload(file: File) {
        setError(null);
        setUploading(true);

        const fd = new FormData();
        fd.append("file", file);

        const res = await authFetch(`/api/challenges/${challengeId}/files`, { method: "POST", body: fd });

        if (res.ok) {
            await refresh();
        } else {
            const json = await res.json().catch(() => ({}));
            setError(json.error ?? "Upload failed");
        }

        setUploading(false);

        if (inputRef.current) {
            inputRef.current.value = "";
        }
    }

    async function download(f: ChallengeFile) {
        const res = await authFetch(`/api/challenge-files/${f.id}`);

        if (!res.ok) return;

        downloadBlob(await res.blob(), f.filename);
    }

    async function remove(f: ChallengeFile) {
        if (!confirm(`Delete "${f.filename}"?`)) return;

        const res = await authFetch(`/api/challenge-files/${f.id}`, { method: "DELETE" });

        if (res.ok) {
            await refresh();
        }
    }

    return (
        <div className="flex flex-col gap-2 pb-3 border-b border-border">
            <div className="text-xs text-muted font-semibold uppercase">Files</div>
            {files === null ? (
                <div className="text-muted text-[13px]">Loading...</div>
            ) : files.length === 0 ? (
                <div className="text-muted text-[13px]">No files attached.</div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {files.map(f => {
                        const mayDelete = canDelete || f.uploadedBy === myId;
                        return (
                            <div key={f.id} className="flex items-center gap-2 text-[13px]">
                                <button className="btn-text flex-1 text-left truncate" title={f.filename} onClick={() => download(f)}>
                                    {f.filename}
                                </button>
                                <span className="text-muted text-xs shrink-0">{formatSize(f.sizeBytes)}</span>
                                {f.source === "ctfd" && <span className="text-muted text-[10px] shrink-0">CTFd</span>}
                                {mayDelete && (
                                    <button className="btn-text text-danger shrink-0" onClick={() => remove(f)}>x</button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
            <button className="btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload file"}
            </button>
            {error && <p className="text-danger text-[12px] m-0">{error}</p>}
        </div>
    );
}

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

    async function editChallenge(title: string, category: string, points: string, url: string, description: string) {
        if (!id) return;

        const db = await getDb();
        const doc = await db.challenges.findOne(id).exec();
        if (!doc) return;

        await doc.patch({
            title: title.trim(),
            category: category.trim(),
            points: Number(points) || 0,
            url: url.trim(),
            description: description,
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
            {showEdit && <EditChallengeOverlay challenge={challenge} onClose={() => setShowEdit(false)} onSave={editChallenge} />}

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

                        <ChallengeFiles challengeId={challenge.id} canDelete={isOwner} />

                        {challenge.solved ? (
                            <>
                                <div className="bg-success/10 border border-success rounded-md px-3 py-2 text-success font-semibold text-sm inline-flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Solved
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
