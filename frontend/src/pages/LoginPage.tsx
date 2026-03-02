import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../auth";

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
            navigate("/");
        } catch {
            setError("Could not reach server");
        } finally {
            setLoading(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "8px 10px",
        background: "#2a2a2a",
        border: "1px solid #444",
        borderRadius: 6,
        color: "#fff",
        fontSize: 14,
        boxSizing: "border-box",
    };

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#111" }}>
            <div style={{ background: "#1a1a1a", padding: 32, borderRadius: 10, width: 340, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", gap: 8 }}>
                    {(["login", "register"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setError(null); }}
                            style={{
                                flex: 1,
                                padding: "8px 0",
                                background: mode === m ? "#333" : "transparent",
                                border: "1px solid #444",
                                borderRadius: 6,
                                color: mode === m ? "#fff" : "#aaa",
                                cursor: "pointer",
                                fontWeight: mode === m ? 700 : 400,
                                fontSize: 14,
                            }}
                        >
                            {m === "login" ? "Login" : "Register"}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input
                        style={inputStyle}
                        placeholder="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                    />
                    {mode === "register" && (
                        <input
                            style={inputStyle}
                            placeholder="Email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    )}
                    <input
                        style={inputStyle}
                        placeholder="Password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                    />
                    {mode === "register" && (
                        <input
                            style={inputStyle}
                            placeholder="Confirm password"
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    )}

                    {error && <p style={{ color: "#f66", margin: 0, fontSize: 13 }}>{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: "9px 0",
                            background: "#4a7fff",
                            border: "none",
                            borderRadius: 6,
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        {loading ? "..." : mode === "login" ? "Login" : "Register"}
                    </button>
                </form>
            </div>
        </div>
    );
}