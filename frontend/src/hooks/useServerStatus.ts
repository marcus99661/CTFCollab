import { useEffect, useRef, useState } from "react";

export type ServerStatus = "online" | "unstable" | "offline";

const PING_INTERVAL_MS = 12_000;
const PING_TIMEOUT_MS = 5_000;
const UNSTABLE_THRESHOLD = 2; // consecutive failures before showing "unstable"

async function ping(): Promise<boolean> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
        const res = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
        return res.ok;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timer);
    }
}

export function useServerStatus(): ServerStatus {
    const [status, setStatus] = useState<ServerStatus>("online");
    const failures = useRef(0);

    useEffect(() => {
        let stopped = false;

        async function check() {
            if (stopped) return;

            if (!navigator.onLine) {
                failures.current = 0;
                setStatus("offline");
                return;
            }

            const ok = await ping();
            if (stopped) return;

            if (ok) {
                failures.current = 0;
                setStatus("online");
            } else {
                failures.current += 1;
                setStatus(failures.current >= UNSTABLE_THRESHOLD ? "unstable" : "online");
            }
        }

        // Run immediately, then on interval
        check();
        const interval = window.setInterval(check, PING_INTERVAL_MS);

        function handleOnline() { check(); }
        function handleOffline() { setStatus("offline"); failures.current = 0; }

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            stopped = true;
            window.clearInterval(interval);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return status;
}
