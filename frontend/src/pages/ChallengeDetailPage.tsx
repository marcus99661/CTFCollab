import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getDb, type ChallengeDoc } from "../db";
import { startChallengesAutoSync } from "../sync/challengesSync";
import { startNotesAutoSync } from "../sync/notesSync";
import NoteEditor from "../components/NoteEditor";
import "../styles/ui.css";
import "../styles/ChallengeDetailPage.css";

export default function ChallengeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [challenge, setChallenge] = useState<ChallengeDoc | null>(null);

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
                setChallenge(doc ? doc.toJSON() : null);
            });
        }
        init().catch(console.error);

        return () => {
            sub?.unsubscribe();
            stopChallengeSync?.();
            stopNotesSync?.();
        };
    }, [id]);

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
                <div className="challenge-side-panel" />

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
