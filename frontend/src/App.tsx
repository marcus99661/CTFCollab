import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import ChallengeDetailPage from "./pages/ChallengeDetailPage";
import CtftimePage from "./pages/CtftimePage";
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
                                <Route path="/" element={<DashboardPage />} />
                                <Route path="/events" element={<EventsPage />} />
                                <Route path="/events/:id" element={<EventDetailPage />} />
                                <Route path="/challenges/:id" element={<ChallengeDetailPage />} />
                                <Route path="/ctftime" element={<CtftimePage />} />
                            </Routes>
                        </PageShell>
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}
