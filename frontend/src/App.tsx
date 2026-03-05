import { Navigate, Route, Routes } from "react-router-dom";
import NotesPage from "./pages/NotesPage";
import EventsPage from "./pages/EventsPage";
import ChallengesPage from "./pages/ChallengesPage";
import LoginPage from "./pages/LoginPage";
import PageShell from "./components/PageShell";
import { getToken } from "./auth";

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
                        <PageShell>
                            <Routes>
                                <Route path="/" element={<NotesPage />} />
                                <Route path="/events" element={<EventsPage />} />
                                <Route path="/challenges" element={<ChallengesPage />} />
                            </Routes>
                        </PageShell>
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}
