import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import ChallengeDetailPage from "./pages/ChallengeDetailPage";
import CtftimePage from "./pages/CtftimePage";
import CtfdEventPage from "./pages/CtfdEventPage";
import InvitePage from "./pages/InvitePage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import PageShell from "./components/PageShell";
import { getToken } from "./auth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (!getToken()) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
    if (getToken()) return <Navigate to="/" replace />;
    return <>{children}</>;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <PageShell>
                            <Routes>
                                <Route path="/" element={<DashboardPage />} />
                                <Route path="/events" element={<EventsPage />} />
                                <Route path="/events/:id" element={<EventDetailPage />} />
                                <Route path="/events/:id/ctfd" element={<CtfdEventPage />} />
                                <Route path="/challenges/:id" element={<ChallengeDetailPage />} />
                                <Route path="/ctftime" element={<CtftimePage />} />
                                <Route path="/profile" element={<ProfilePage />} />
                            </Routes>
                        </PageShell>
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}
