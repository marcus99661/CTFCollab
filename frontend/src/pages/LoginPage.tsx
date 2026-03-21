import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken, setCollabUser } from "../auth";
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
            const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
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
            setCollabUser(json.username, color);
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
            <div style={{ width: 320 }}>
                <h2 style={{ color: "var(--text)", fontWeight: 600, fontSize: 20, marginBottom: 20 }}>
                    {mode === "login" ? "Sign in" : "Create account"}
                </h2>

                <div className="card">
                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input
                            className="input"
                            style={{ width: "100%" }}
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                        {mode === "register" && (
                            <input
                                className="input"
                                style={{ width: "100%" }}
                                placeholder="Email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        )}
                        <input
                            className="input"
                            style={{ width: "100%" }}
                            placeholder="Password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                        {mode === "register" && (
                            <input
                                className="input"
                                style={{ width: "100%" }}
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
                            style={{ width: "100%", marginTop: 4 }}
                        >
                            {loading ? "..." : mode === "login" ? "Sign in" : "Register"}
                        </button>
                    </form>
                </div>

                <p style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
                    {mode === "login" ? (
                        <>No account? <a href="#" onClick={e => { e.preventDefault(); setMode("register"); setError(null); }}>Register</a></>
                    ) : (
                        <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); setMode("login"); setError(null); }}>Sign in</a></>
                    )}
                </p>
            </div>
        </div>
    );
}
