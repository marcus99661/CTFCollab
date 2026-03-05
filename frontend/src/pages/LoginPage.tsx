import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../auth";
import "../styles/ui.css";

export default function LoginPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const url = mode === "login" ? "/auth/login" : "/auth/register";
            const body = mode === "login"
                ? { username, password }
                : { username, email, password, confirmPassword };

            const res = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });

            const json = await res.json();

            if (!res.ok) {
                setError(json.error ?? "Something went wrong");
                return;
            }

            setToken(json.token);
            const colors = ["#958DF1", "#F98181", "#FBBC88", "#70CFF8", "#94FADB", "#B9F18D"];
            const color = colors[json.username.charCodeAt(0) % colors.length];
            localStorage.setItem("collab_user", JSON.stringify({ name: json.username, color }));
            navigate("/");
        } catch {
            setError("Could not reach server");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            background: "var(--bg)",
        }}>
            <div style={{ width: 340 }}>
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                    <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>
                        ◈ baka
                    </span>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>CTF collaboration tool</div>
                </div>

                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Tab switcher */}
                    <div style={{ display: "flex", gap: 6 }}>
                        {(["login", "register"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setError(null); }}
                                style={{
                                    flex: 1,
                                    padding: "7px 0",
                                    background: mode === m ? "rgba(88,166,255,0.12)" : "transparent",
                                    border: `1px solid ${mode === m ? "var(--accent)" : "var(--border)"}`,
                                    borderRadius: 6,
                                    color: mode === m ? "var(--accent)" : "var(--muted)",
                                    cursor: "pointer",
                                    fontWeight: mode === m ? 600 : 400,
                                    fontSize: 13,
                                    fontFamily: "inherit",
                                    transition: "all 0.15s",
                                }}
                            >
                                {m === "login" ? "Login" : "Register"}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input
                            className="input"
                            style={{ width: "100%", boxSizing: "border-box" }}
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                        {mode === "register" && (
                            <input
                                className="input"
                                style={{ width: "100%", boxSizing: "border-box" }}
                                placeholder="Email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        )}
                        <input
                            className="input"
                            style={{ width: "100%", boxSizing: "border-box" }}
                            placeholder="Password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                        {mode === "register" && (
                            <input
                                className="input"
                                style={{ width: "100%", boxSizing: "border-box" }}
                                placeholder="Confirm password"
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                            />
                        )}

                        {error && (
                            <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{error}</p>
                        )}

                        <button
                            className="btn btn-primary"
                            type="submit"
                            disabled={loading}
                            style={{ width: "100%", padding: "9px 0", marginTop: 4 }}
                        >
                            {loading ? "…" : mode === "login" ? "Login" : "Register"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
