import { authFetch } from "./auth";

type QueuedRequest = {
    key: string;
    url: string;
    method: string;
    body?: string;
};

const STORAGE_KEY = "offlineQueue";

function load(): QueuedRequest[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function save(queue: QueuedRequest[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {}
}

function send(req: QueuedRequest): Promise<Response> {
    return authFetch(req.url, {
        method: req.method,
        headers: req.body ? { "Content-Type": "application/json" } : undefined,
        body: req.body,
    });
}

// Send the request now if we are online. If we are offline the request is parked in the queue
export async function sendOrQueue(
    key: string,
    url: string,
    options: { method: string; body?: string },
): Promise<Response | null> {
    const req: QueuedRequest = { key, url, method: options.method, body: options.body };

    if (navigator.onLine) {
        try {
            return await send(req);
        } catch {}
    }

    const queue = load().filter(r => r.key !== key);
    queue.push(req);
    save(queue);

    return null;
}

let flushing = false;

export async function flushQueue() {
    if (flushing || !navigator.onLine) return;

    flushing = true;
    try {
        for (const req of load()) {
            try {
                await send(req);
            } catch {
                break;
            }

            save(load().filter(r => r.key !== req.key));
        }
    } finally {
        flushing = false;
    }
}

export function startQueueFlusher() {
    window.addEventListener("online", flushQueue);
    flushQueue();
}