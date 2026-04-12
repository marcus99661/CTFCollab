import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken, setCollabUser, getUserIdFromToken } from "../auth";
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

            const prevUserId = getUserIdFromToken();
            setToken(json.token);

            // If a different user was previously logged in, wipe their local data
            if (prevUserId && prevUserId !== json.user_id) {
                const { getDb, resetDb } = await import("../db");
                const db = await getDb();
                await db.remove();
                resetDb();
                localStorage.removeItem("eventsCheckpoint");
                localStorage.removeItem("challengesCheckpoint");
                localStorage.removeItem("notesCheckpoint");
            }

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
        <div className="flex justify-center items-center h-screen bg-bg">
            <div className="w-80">
                <h2 className="text-text font-semibold text-xl mb-5">
                    {mode === "login" ? "Sign in" : "Create account"}
                </h2>

                <div className="card">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
                        <input
                            className="input w-full"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                        {mode === "register" && (
                            <input
                                className="input w-full"
                                placeholder="Email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        )}
                        <input
                            className="input w-full"
                            placeholder="Password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                        {mode === "register" && (
                            <input
                                className="input w-full"
                                placeholder="Confirm password"
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                            />
                        )}

                        {error && (
                            <p className="text-danger m-0 text-[13px]">{error}</p>
                        )}

                        <button
                            className="btn btn-primary w-full mt-1"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? "..." : mode === "login" ? "Sign in" : "Register"}
                        </button>
                    </form>
                </div>

                <p className="mt-3.5 text-[13px] text-muted">
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
