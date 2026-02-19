import { useEffect, useState } from "react";
import { getDb, type ChallengeDoc, type EventDoc } from "../db";
import { startChallengesAutoSync } from "../challengesSync";

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
            await db.challenges.insert({
                id: crypto.randomUUID(),
                eventId: newEventId,
                title,
                category: newCategory.trim(),
                points: Number(newPoints) || 0,
                url: newUrl.trim(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
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
        <div style={{ maxWidth: 980, margin: "32px auto", padding: 16 }}>
            <h1>Challenges</h1>
            <div style={{ marginBottom: 12, opacity: 0.8 }}>Status: {status}</div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Title (required)"
                    style={{ padding: 8, minWidth: 200 }}
                />
                <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Category"
                    style={{ padding: 8, minWidth: 120 }}
                />
                <input
                    type="number"
                    value={newPoints}
                    onChange={(e) => setNewPoints(e.target.value)}
                    placeholder="Points"
                    style={{ padding: 8, minWidth: 80 }}
                />
                <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="URL"
                    style={{ padding: 8, minWidth: 200 }}
                />
                <select
                    value={newEventId}
                    onChange={(e) => setNewEventId(e.target.value)}
                    style={{ padding: 8 }}
                >
                    <option value="">— No event —</option>
                    {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                </select>
                <button onClick={createChallenge} disabled={!newTitle.trim()}>Add Challenge</button>
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={{ marginRight: 8 }}>Filter by event:</label>
                <select
                    value={filterEventId}
                    onChange={(e) => setFilterEventId(e.target.value)}
                    style={{ padding: 6 }}
                >
                    <option value="">All Events</option>
                    {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                </select>
            </div>

            {displayedChallenges.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No challenges yet.</div>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Title</th>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Category</th>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Points</th>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>URL</th>
                            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Event</th>
                            <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedChallenges.map((ch) => (
                            <tr key={ch.id}>
                                <td style={{ padding: 8 }}>{ch.title}</td>
                                <td style={{ padding: 8 }}>{ch.category}</td>
                                <td style={{ padding: 8 }}>{ch.points}</td>
                                <td style={{ padding: 8 }}>
                                    {ch.url ? <a href={ch.url} target="_blank" rel="noopener noreferrer">{ch.url}</a> : "—"}
                                </td>
                                <td style={{ padding: 8 }}>{ch.eventId ? eventName(ch.eventId) : "—"}</td>
                                <td style={{ padding: 8 }}>
                                    <button onClick={() => deleteChallenge(ch.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
