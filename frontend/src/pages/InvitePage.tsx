import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { setToken, getToken, setCollabUser } from "../auth";
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
            const res = await fetch(`/api/invite/${token}/join`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` },
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
            setToken(json.token);
            const color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 60%)`;
            setCollabUser(username, color);
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
            setToken(json.token);
            setCollabUser(username, `hsl(${Math.floor(Math.random() * 360)}, 60%, 60%)`);

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
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
                <div className="card" style={{ width: 380, textAlign: "center" }}>
                    <p style={{ color: "var(--danger)", margin: 0 }}>{loadError}</p>
                </div>
            </div>
        );
    }

    if (!info) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
                <div style={{ color: "var(--muted)" }}>Loading...</div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
            <div className="overlay-box" style={{ width: 420 }}>
                <div className="overlay-box-header">
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>You've been invited to</div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{info.event_name}</h2>
                </div>
                <div className="overlay-box-body">
                    {alreadyLoggedIn ? (
                        <>
                            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                                You're already signed in. Click below to join the event.
                            </p>
                            {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{error}</p>}
                            <div className="form-actions">
                                <button className="btn btn-primary" onClick={joinAsCurrentUser} disabled={loading}>
                                    {loading ? "Joining..." : "Join event"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                                {(["register", "login"] as Tab[]).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setTab(t); setError(null); }}
                                        style={{
                                            flex: 1,
                                            padding: "8px 0",
                                            background: "none",
                                            border: "none",
                                            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                                            color: tab === t ? "var(--text)" : "var(--muted)",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            fontFamily: "inherit",
                                            fontWeight: tab === t ? 600 : 400,
                                            marginBottom: -1,
                                        }}
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

                            {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{error}</p>}

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