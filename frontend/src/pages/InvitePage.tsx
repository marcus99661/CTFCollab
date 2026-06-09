import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { saveSession, getToken, authFetch } from "../auth";
import "../styles/ui.css";

interface InviteInfo {
    event_id: string;
    event_name: string;
    event_based: boolean;
    expires_at: number | null;
    uses: number;
    max_uses: number | null;
}

type Tab = "register" | "login";

export default function InvitePage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [info, setInfo] = useState<InviteInfo | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("register");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const alreadyLoggedIn = !!getToken();

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(`/api/invite/${token}`);
                if (!res.ok) throw new Error(res.status === 404 ? "Invite not found or expired" : "Failed to load invite");
                setInfo(await res.json());
            } catch (e: any) {
                setLoadError(e.message);
            }
        }
        load();
    }, [token]);

    async function joinAsCurrentUser() {
        setError(null);
        setLoading(true);
        try {
            const res = await authFetch(`/api/invite/${token}/join`, {
                method: "POST",
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error ?? "Failed to join event");
            }
            navigate(`/events/${info!.event_id}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function register() {
        setError(null);
        setLoading(true);
        try {
            const res = await fetch(`/api/invite/${token}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Registration failed");
            saveSession(json.token, username);
            navigate(`/events/${info!.event_id}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function login() {
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Login failed");
            saveSession(json.token, username);

            const joinRes = await fetch(`/api/invite/${token}/join`, {
                method: "POST",
                headers: { Authorization: `Bearer ${json.token}` },
            });
            if (!joinRes.ok && joinRes.status !== 409) throw new Error("Failed to join event");
            navigate(`/events/${info!.event_id}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    if (loadError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg">
                <div className="card w-[380px] text-center">
                    <p className="text-danger m-0">{loadError}</p>
                </div>
            </div>
        );
    }

    if (!info) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg">
                <div className="text-muted">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg">
            <div className="overlay-box w-[420px]">
                <div className="overlay-box-header">
                    <div className="text-xs text-muted mb-1">You've been invited to</div>
                    <h2 className="m-0 text-lg font-semibold">{info.event_name}</h2>
                </div>
                <div className="overlay-box-body">
                    {alreadyLoggedIn ? (
                        <>
                            <p className="m-0 text-sm text-muted">
                                You're already signed in. Click below to join the event.
                            </p>
                            {error && <p className="text-danger m-0 text-[13px]">{error}</p>}
                            <div className="form-actions">
                                <button className="btn btn-primary" onClick={joinAsCurrentUser} disabled={loading}>
                                    {loading ? "Joining..." : "Join event"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex gap-0 border-b border-border mb-1">
                                {(["register", "login"] as Tab[]).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setTab(t); setError(null); }}
                                        className={`flex-1 py-2 bg-transparent border-0 border-b-2 cursor-pointer text-[13px] font-[inherit] -mb-px ${
                                            tab === t
                                                ? "border-accent text-text font-semibold"
                                                : "border-transparent text-muted font-normal"
                                        }`}
                                    >
                                        {t === "register" ? "Create account" : "Sign in"}
                                    </button>
                                ))}
                            </div>

                            <label className="form-field">
                                <span className="form-field-label">Username</span>
                                <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
                            </label>

                            {tab === "register" && (
                                <label className="form-field">
                                    <span className="form-field-label">Email</span>
                                    <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                                </label>
                            )}

                            <label className="form-field">
                                <span className="form-field-label">Password</span>
                                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") tab === "register" ? register() : login(); }}
                                />
                            </label>

                            {error && <p className="text-danger m-0 text-[13px]">{error}</p>}

                            <div className="form-actions">
                                <button
                                    className="btn btn-primary"
                                    onClick={tab === "register" ? register : login}
                                    disabled={loading || !username.trim() || !password.trim() || (tab === "register" && !email.trim())}
                                >
                                    {loading ? "..." : tab === "register" ? "Create account & join" : "Sign in & join"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
