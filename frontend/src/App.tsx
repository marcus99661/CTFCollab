import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import NotesPage from "./pages/NotesPage";
import EventsPage from "./pages/EventsPage";
import ChallengesPage from "./pages/ChallengesPage";
import LoginPage from "./pages/LoginPage";
import { clearToken, getToken } from "./auth";

const navLinks = [
    { to: "/", label: "Notes" },
    { to: "/events", label: "Events" },
    { to: "/challenges", label: "Challenges" },
];

function NavBar() {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    function logout() {
        clearToken();
        navigate("/login");
    }

    return (
        <nav style={{ background: "#1a1a1a", padding: "10px 24px", display: "flex", gap: 24, alignItems: "center" }}>
            {navLinks.map(({ to, label }) => {
                const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
                return (
                    <Link
                        key={to}
                        to={to}
                        style={{
                            color: active ? "#fff" : "#aaa",
                            textDecoration: "none",
                            fontWeight: active ? 700 : 400,
                            fontSize: 15,
                        }}
                    >
                        {label}
                    </Link>
                );
            })}
            <button
                onClick={logout}
                style={{
                    marginLeft: "auto",
                    background: "transparent",
                    border: "1px solid #444",
                    borderRadius: 6,
                    color: "#aaa",
                    padding: "4px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                }}
            >
                Logout
            </button>
        </nav>
    );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (!getToken()) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <NavBar />
                        <Routes>
                            <Route path="/" element={<NotesPage />} />
                            <Route path="/events" element={<EventsPage />} />
                            <Route path="/challenges" element={<ChallengesPage />} />
                        </Routes>
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}