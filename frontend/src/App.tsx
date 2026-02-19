import { Link, Route, Routes, useLocation } from "react-router-dom";
import NotesPage from "./pages/NotesPage";
import EventsPage from "./pages/EventsPage";
import ChallengesPage from "./pages/ChallengesPage";

const navLinks = [
    { to: "/", label: "Notes" },
    { to: "/events", label: "Events" },
    { to: "/challenges", label: "Challenges" },
];

function NavBar() {
    const { pathname } = useLocation();

    return (
        <nav style={{ background: "#1a1a1a", padding: "10px 24px", display: "flex", gap: 24 }}>
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
        </nav>
    );
}

export default function App() {
    return (
        <>
            <NavBar />
            <Routes>
                <Route path="/" element={<NotesPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/challenges" element={<ChallengesPage />} />
            </Routes>
        </>
    );
}
