import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearToken, getCollabUser, clearCollabUser } from "../auth";
import { useServerStatus, type ServerStatus } from "../hooks/useServerStatus";

const navLinks = [
    { to: "/", label: "Dashboard" },
    { to: "/events", label: "Events" },
    { to: "/ctftime", label: "CTFtime" },
];

const statusConfig: Record<ServerStatus, { color: string; label: string; title: string }> = {
    online: { color: "#16a34a", label: "Connected", title: "Server reachable" },
    unstable: { color: "#d97706", label: "Unstable", title: "Server not responding - changes saved locally" },
    offline: { color: "#dc2626", label: "Disconnected", title: "No network" },
};

export default function Header() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const serverStatus = useServerStatus();
    const sc = statusConfig[serverStatus];

    const collabUser = getCollabUser();

    async function logout() {
        const { getDb, resetDb } = await import("../db");
        const db = await getDb();
        await db.remove();
        resetDb();
        clearToken();
        clearCollabUser();
        localStorage.removeItem("eventsCheckpoint");
        localStorage.removeItem("challengesCheckpoint");
        localStorage.removeItem("notesCheckpoint");
        navigate("/login");
    }

    return (
        <header style={{
            height: 52,
            background: "var(--navbar)",
            borderBottom: "1px solid rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: 24,
            flexShrink: 0,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", userSelect: "none" }}>
                CTFCollab
            </span>

            <nav style={{ display: "flex", gap: 4, flex: 1 }}>
                {navLinks.map(({ to, label }) => {
                    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
                    return (
                        <Link
                            key={to}
                            to={to}
                            style={{
                                padding: "5px 12px",
                                borderRadius: 6,
                                color: active ? "#fff" : "rgba(255,255,255,0.75)",
                                fontWeight: active ? 600 : 400,
                                fontSize: 14,
                                textDecoration: "none",
                                background: active ? "rgba(255,255,255,0.15)" : "transparent",
                            }}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                    title={sc.title}
                    style={{
                        fontSize: 12,
                        color: sc.color,
                        cursor: "default",
                        userSelect: "none",
                    }}
                >
                    {sc.label}
                </span>

                <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.25)", flexShrink: 0 }} />

                {collabUser && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: collabUser.color ?? "#fff",
                            flexShrink: 0,
                        }} />
                        {collabUser.name}
                    </span>
                )}

                <button
                    onClick={logout}
                    style={{
                        background: "rgba(255,255,255,0.15)",
                        border: "1px solid rgba(255,255,255,0.3)",
                        borderRadius: 4,
                        color: "#fff",
                        padding: "4px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "inherit",
                    }}
                >
                    Logout
                </button>
            </div>
        </header>
    );
}
