import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearToken } from "../auth";
import { useServerStatus, type ServerStatus } from "../hooks/useServerStatus";

const navLinks = [
    { to: "/", label: "Notes" },
    { to: "/events", label: "Events" },
    { to: "/challenges", label: "Challenges" },
    { to: "/users", label: "Users" },
];

const statusConfig: Record<ServerStatus, { color: string; bg: string; label: string; title: string }> = {
    online:   { color: "#16a34a", bg: "rgba(22,163,74,0.15)",  label: "Connected",    title: "Server reachable" },
    unstable: { color: "#d97706", bg: "rgba(217,119,6,0.15)",  label: "Unstable",     title: "Server not responding — changes saved locally" },
    offline:  { color: "#dc2626", bg: "rgba(220,38,38,0.15)",  label: "Disconnected", title: "No network — serving from cache" },
};

export default function Header() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const serverStatus = useServerStatus();
    const sc = statusConfig[serverStatus];

    const collabUser = (() => {
        try {
            return JSON.parse(localStorage.getItem("collab_user") ?? "null");
        } catch {
            return null;
        }
    })();

    function logout() {
        clearToken();
        localStorage.removeItem("collab_user");
        navigate("/login");
    }

    return (
        <header style={{
            height: 52,
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: 24,
            flexShrink: 0,
        }}>
            {/* Logo */}
            <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", userSelect: "none" }}>
                ◈ baka
            </span>

            {/* Nav */}
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
                                color: active ? "var(--accent)" : "var(--muted)",
                                fontWeight: active ? 600 : 400,
                                fontSize: 14,
                                textDecoration: "none",
                                background: active ? "rgba(88, 166, 255, 0.1)" : "transparent",
                                transition: "color 0.15s, background 0.15s",
                            }}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>

            {/* Right side */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Server status */}
                <span
                    title={sc.title}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 12px",
                        borderRadius: 20,
                        background: sc.bg,
                        border: `1px solid ${sc.color}44`,
                        color: sc.color,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "default",
                        userSelect: "none",
                        transition: "background 0.3s, color 0.3s, border-color 0.3s",
                        letterSpacing: "0.01em",
                    }}
                >
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: sc.color,
                        flexShrink: 0,
                        boxShadow: `0 0 5px ${sc.color}`,
                        transition: "background 0.3s",
                    }} />
                    {sc.label}
                </span>

                {/* Divider */}
                <span style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />

                {/* Username */}
                {collabUser && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: collabUser.color ?? "var(--accent)",
                            flexShrink: 0,
                        }} />
                        {collabUser.name}
                    </span>
                )}

                {/* Logout */}
                <button
                    onClick={logout}
                    style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--muted)",
                        padding: "4px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "inherit",
                        transition: "border-color 0.15s, color 0.15s",
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--muted)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
                    }}
                >
                    Logout
                </button>
            </div>
        </header>
    );
}
