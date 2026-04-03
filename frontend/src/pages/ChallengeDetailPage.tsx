import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getDb, type ChallengeDoc } from "../db";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import { getCollabUser } from "../auth";
import NoteEditor from "../components/NoteEditor";
import "../styles/ui.css";
import "../styles/ChallengeDetailPage.css";

export default function ChallengeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [challenge, setChallenge] = useState<ChallengeDoc | null>(null);
    const [flagInput, setFlagInput] = useState("");

    useEffect(() => {
        if (!id) return;
        let stopChallengeSync: (() => void) | null = null;
        let stopNotesSync: (() => void) | null = null;
        let sub: any = null;

        async function init() {
            const db = await getDb();
            stopChallengeSync = startChallengesAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 8000 });
            stopNotesSync = startNotesAutoSync({ db, baseUrl: "", debounceMs: 900, pollMs: 8000 });

            sub = db.challenges.findOne(id).$.subscribe((doc: any) => {
                if (!doc) { setChallenge(null); return; }
                const data = doc.toJSON();
                setChallenge(data);
                setFlagInput(data.flag ?? "");
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

    if (!challenge) {
        return <div className="empty-state">Challenge not found.</div>;
    }

    return (
        <div className="challenge-detail">
            <div className="challenge-detail-header">
                <Link to={`/events/${challenge.eventId}`} className="back-link">&lt; Back</Link>
                <span className="challenge-detail-title">{challenge.title}</span>
                {challenge.category && (
                    <span className="challenge-detail-category">{challenge.category}</span>
                )}
                {challenge.points > 0 && (
                    <span className="points-badge">{challenge.points} pts</span>
                )}
                {challenge.url && (
                    <a href={challenge.url} target="_blank" rel="noopener noreferrer" className="challenge-detail-link">
                        link
                    </a>
                )}
            </div>

            <div className="challenge-detail-body">
                <div className="challenge-side-panel">
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                        {(() => {
                            const username = getCollabUser()?.name;
                            const solvers = challenge.solvers ?? [];
                            const isSolving = username ? solvers.includes(username) : false;
                            return !challenge.solved && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
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
                                <div style={{
                                    background: "#3fb95022",
                                    border: "1px solid #3fb950",
                                    borderRadius: 6,
                                    padding: "8px 12px",
                                    color: "#3fb950",
                                    fontWeight: 600,
                                    fontSize: 14,
                                }}>
                                    ✓ Solved
                                </div>
                                {challenge.solvedBy && (
                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>by {challenge.solvedBy}</div>
                                )}
                                <input
                                    className="input"
                                    readOnly
                                    value={challenge.flag ?? ""}
                                    style={{ fontFamily: "monospace", fontSize: 13 }}
                                />
                                <button className="btn" onClick={unsolve}>Unsolve</button>
                            </>
                        ) : (
                            <>
                                <label className="form-field">
                                    <span className="form-field-label">Flag</span>
                                    <input
                                        className="input"
                                        value={flagInput}
                                        onChange={e => setFlagInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") markSolved(); }}
                                        placeholder="flag{...}"
                                        style={{ fontFamily: "monospace", fontSize: 13 }}
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

                <div className="challenge-note-panel">
                    {challenge.noteId
                        ? <NoteEditor key={challenge.noteId} noteId={challenge.noteId} />
                        : <div className="empty-state">No note attached to this challenge.</div>
                    }
                </div>
            </div>
        </div>
    );
}
