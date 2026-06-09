import { hashColor } from "./utils";

const TOKEN_KEY = "auth_token";
const COLLAB_USER_KEY = "collab_user";

export function getCollabUser(): { name: string; color: string } | null {
    try {
        const stored = localStorage.getItem(COLLAB_USER_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

export function setCollabUser(name: string, color: string): void {
    localStorage.setItem(COLLAB_USER_KEY, JSON.stringify({ name, color }));
}

export function clearCollabUser(): void {
    localStorage.removeItem(COLLAB_USER_KEY);
}

export function pickCollabColor(name: string): string {
    return `hsl(${hashColor(name)}, 70%, 72%)`;
}

export function saveSession(token: string, username: string): void {
    setToken(token);
    setCollabUser(username, pickCollabColor(username));
}

function decodeTokenPayload(): Record<string, any> | null {
    const token = getToken();
    if (!token) return null;
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

export function getUserIdFromToken(): string | null {
    return decodeTokenPayload()?.sub ?? null;
}

export function isEventBased(): boolean {
    return decodeTokenPayload()?.event_based === true;
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${getToken()}`,
        },
    });

    // Wipe local auth and bounce to login so the user doesnt have a dead session
    if (res.status === 401) {
        clearToken();
        clearCollabUser();

        if (window.location.pathname !== "/login") {
            window.location.href = "/login";
        }
    }

    return res;
}