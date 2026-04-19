import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import InvitePage from "./pages/InvitePage";
import PageShell from "./components/PageShell";
import { getToken } from "./auth";

const EventsPage = lazy(() => import("./pages/EventsPage"));
const EventDetailPage = lazy(() => import("./pages/EventDetailPage"));
const ChallengeDetailPage = lazy(() => import("./pages/ChallengeDetailPage"));
const CtftimePage = lazy(() => import("./pages/CtftimePage"));
const CtfdEventPage = lazy(() => import("./pages/CtfdEventPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (!getToken()) return <Navigate to="/login" replace />;

    return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
    if (getToken()) return <Navigate to="/" replace />;

    return <>{children}</>;
}

function RouteFallback() {
    return <div className="p-6 text-muted text-sm">Loading...</div>;
}

function useIdlePrefetch() {
    useEffect(() => {
        const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 400));
        const handle = idle(() => {
            import("./pages/EventDetailPage");
            import("./pages/ChallengeDetailPage");
            import("./pages/EventsPage");
        });

        return () => {
            const cancel = (window as any).cancelIdleCallback;
            if (cancel) cancel(handle);
        };
    }, []);
}

export default function App() {
    useIdlePrefetch();

    return (
        <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <PageShell>
                            <Suspense fallback={<RouteFallback />}>
                                <Routes>
                                    <Route path="/" element={<DashboardPage />} />
                                    <Route path="/events" element={<EventsPage />} />
                                    <Route path="/events/:id" element={<EventDetailPage />} />
                                    <Route path="/events/:id/ctfd" element={<CtfdEventPage />} />
                                    <Route path="/challenges/:id" element={<ChallengeDetailPage />} />
                                    <Route path="/ctftime" element={<CtftimePage />} />
                                    <Route path="/profile" element={<ProfilePage />} />
                                </Routes>
                            </Suspense>
                        </PageShell>
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}
