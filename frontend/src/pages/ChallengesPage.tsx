import { useEffect, useState } from "react";
import { getDb, type ChallengeDoc, type EventDoc } from "../db";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import { makeId } from "../utils";
import "../styles/ui.css";

export default function ChallengesPage() {
    const [status, setStatus] = useState("Loading…");
    const [challenges, setChallenges] = useState<ChallengeDoc[]>([]);
    const [events, setEvents] = useState<EventDoc[]>([]);
    const [filterEventId, setFilterEventId] = useState("");

    const [newTitle, setNewTitle] = useState("");
    const [newCategory, setNewCategory] = useState("");
    const [newPoints, setNewPoints] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [newEventId, setNewEventId] = useState("");

    useEffect(() => {
        let stopSync: null | (() => void) = null;
        let challengeSub: any = null;
        let eventSub: any = null;

        (async () => {
            const db = await getDb();

            stopSync = startChallengesAutoSync({
                db,
                baseUrl: "",
                debounceMs: 900,
                pollMs: 4000,
                onStatus: setStatus,
            });

            startNotesAutoSync({ db, baseUrl: "" });

            challengeSub = db.challenges.find().$.subscribe((docs: any[]) => {
                const list: ChallengeDoc[] = (docs ?? [])
                    .map((d: any) => (d?.toJSON ? d.toJSON() : d))
                    .filter((d: ChallengeDoc) => !d.isDeleted)
                    .sort((a: ChallengeDoc, b: ChallengeDoc) => b.updatedAt - a.updatedAt);

                setChallenges(list);
            });

            eventSub = db.events.find().$.subscribe((docs: any[]) => {
                const list: EventDoc[] = (docs ?? [])
                    .map((d: any) => (d?.toJSON ? d.toJSON() : d))
                    .filter((d: EventDoc) => !d.isDeleted)
                    .sort((a: EventDoc, b: EventDoc) => a.name.localeCompare(b.name));

                setEvents(list);
            });

            setStatus("Ready");
        })().catch((e) => {
            console.error("ChallengesPage init failed:", e);
            setStatus("Init failed (check console)");
        });

        return () => {
            if (challengeSub) challengeSub.unsubscribe();
            if (eventSub) eventSub.unsubscribe();
            if (stopSync) stopSync();
        };
    }, []);

    const displayedChallenges = filterEventId
        ? challenges.filter((c) => c.eventId === filterEventId)
        : challenges;

    async function createChallenge() {
        const title = newTitle.trim();
        if (!title) return;
        try {
            const db = await getDb();
            const noteId = makeId();

            await db.notes.insert({
                id: noteId,
                title,
                updatedAt: Date.now(),
                isDeleted: false,
            });

            await db.challenges.insert({
                id: makeId(),
                eventId: newEventId,
                title,
                category: newCategory.trim(),
                points: Number(newPoints) || 0,
                url: newUrl.trim(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
                noteId,
            });

            setNewTitle("");
            setNewCategory("");
            setNewPoints("");
            setNewUrl("");
        } catch (e) {
            console.error("createChallenge failed:", e);
            setStatus("Create challenge failed (check console)");
        }
    }

    async function deleteChallenge(id: string) {
        try {
            const db = await getDb();
            const doc = await db.challenges.findOne(id).exec();
            if (!doc) return;
            await doc.patch({ isDeleted: true, updatedAt: Date.now() });
        } catch (e) {
            console.error("deleteChallenge failed:", e);
            setStatus("Delete failed (check console)");
        }
    }

    function eventName(eventId: string) {
        return events.find((e) => e.id === eventId)?.name ?? eventId;
    }

    return (
        <div style={{ maxWidth: 1100, margin: "32px auto", padding: "0 16px" }}>
            <h2 className="page-title">Challenges</h2>

            <div className="card" style={{ marginBottom: 20 }}>
                <div className="form-row" style={{ marginBottom: 8 }}>
                    <input
                        className="input"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Title (required)"
                        style={{ flex: "2 1 180px" }}
                    />
                    <input
                        className="input"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="Category"
                        style={{ flex: "1 1 110px" }}
                    />
                    <input
                        className="input"
                        type="number"
                        value={newPoints}
                        onChange={(e) => setNewPoints(e.target.value)}
                        placeholder="Points"
                        style={{ flex: "0 1 80px" }}
                    />
                </div>
                <div className="form-row">
                    <input
                        className="input"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="URL"
                        style={{ flex: "3 1 200px" }}
                    />
                    <select
                        className="select"
                        value={newEventId}
                        onChange={(e) => setNewEventId(e.target.value)}
                        style={{ flex: "1 1 140px" }}
                    >
                        <option value="">— No event —</option>
                        {events.map((ev) => (
                            <option key={ev.id} value={ev.id}>{ev.name}</option>
                        ))}
                    </select>
                    <button className="btn btn-primary" onClick={createChallenge} disabled={!newTitle.trim()}>
                        Add Challenge
                    </button>
                </div>
            </div>

            {/* Filter + status row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <div className="status-bar">
                    <span className="dot" />
                    <span>{status}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Filter:</span>
                    <select
                        className="select"
                        value={filterEventId}
                        onChange={(e) => setFilterEventId(e.target.value)}
                        style={{ fontSize: 12 }}
                    >
                        <option value="">All Events</option>
                        {events.map((ev) => (
                            <option key={ev.id} value={ev.id}>{ev.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {displayedChallenges.length === 0 ? (
                <div className="empty-state">No challenges yet. Create one above.</div>
            ) : (
                <div className="card" style={{ padding: 0 }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Category</th>
                                <th>Points</th>
                                <th>URL</th>
                                <th>Event</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedChallenges.map((ch) => (
                                <tr key={ch.id}>
                                    <td style={{ fontWeight: 500 }}>{ch.title}</td>
                                    <td style={{ color: "var(--muted)" }}>{ch.category || "—"}</td>
                                    <td>
                                        {ch.points ? (
                                            <span className="points-badge">{ch.points}</span>
                                        ) : "—"}
                                    </td>
                                    <td>
                                        {ch.url ? (
                                            <a className="accent-link" href={ch.url} target="_blank" rel="noopener noreferrer">
                                                {ch.url.replace(/^https?:\/\//, "")}
                                            </a>
                                        ) : "—"}
                                    </td>
                                    <td style={{ color: "var(--muted)" }}>
                                        {ch.eventId ? eventName(ch.eventId) : "—"}
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                        <button className="btn btn-danger" onClick={() => deleteChallenge(ch.id)}>
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
