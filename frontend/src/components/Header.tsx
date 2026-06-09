import { Link, useLocation } from "react-router-dom";
import { clearToken, getCollabUser, clearCollabUser, isEventBased } from "../auth";
import "../styles/ui.css";
import { useServerStatus, type ServerStatus } from "../hooks/useServerStatus";

const allNavLinks = [
    { to: "/", label: "Dashboard", eventBasedHidden: false },
    { to: "/events", label: "Events", eventBasedHidden: false },
    { to: "/ctftime", label: "CTFtime", eventBasedHidden: true },
];

const statusConfig: Record<ServerStatus, { color: string; label: string; title: string }> = {
    online: { color: "text-success", label: "Connected", title: "Server reachable" },
    unstable: { color: "text-warning", label: "Unstable", title: "Server connection unstable" },
    offline: { color: "text-danger", label: "Disconnected", title: "No network" },
};

export default function Header() {
    const { pathname } = useLocation();
    const serverStatus = useServerStatus();
    const sc = statusConfig[serverStatus];

    const collabUser = getCollabUser();
    const eventBased = isEventBased();
    const navLinks = allNavLinks.filter(l => !(eventBased && l.eventBasedHidden));

    async function logout() {
        try {
            const { clearLocalData } = await import("../db");
            await clearLocalData();
        } catch (e) {
            console.error("clearLocalData failed during logout:", e);
        }
        clearToken();
        clearCollabUser();
        // Hard reload so no in-memory RxDB handles survive into the next session.
        window.location.assign("/login");
    }

    return (
        <header className="h-[52px] bg-navbar border-b border-white/10 flex items-center px-6 gap-6 shrink-0">
            <span className="text-white font-bold text-[17px] tracking-tight select-none">
                CTFCollab
            </span>

            <nav className="flex gap-1 flex-1">
                {navLinks.map(({ to, label }) => {
                    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
                    return (
                        <Link
                            key={to}
                            to={to}
                            className={`px-3 py-[5px] rounded-md text-sm no-underline ${
                                active
                                    ? "text-white font-semibold bg-white/15"
                                    : "text-white/75 font-normal bg-transparent"
                            }`}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>

            <div className="flex items-center gap-3.5">
                <span
                    title={sc.title}
                    className={`text-xs cursor-default select-none ${sc.color}`}
                >
                    {sc.label}
                </span>

                <span className="w-px h-[18px] bg-white/25 shrink-0" />

                {collabUser && (
                    <span className="flex items-center gap-1.5 text-[13px] text-white/85">
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: collabUser.color ?? "#fff" }}
                        />
                        {collabUser.name}
                    </span>
                )}

                <Link
                    to="/profile"
                    className="bg-white/15 border border-white/30 rounded px-3 py-1 text-white no-underline text-xs"
                >
                    Profile
                </Link>
                <button
                    onClick={logout}
                    className="bg-white/15 border border-white/30 rounded px-3 py-1 text-white cursor-pointer text-xs font-[inherit]"
                >
                    Logout
                </button>
            </div>
        </header>
    );
}
