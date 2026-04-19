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
    let h = 0;
    for (let i = 0; i < name.length; i++) {
        h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
    }
    return `hsl(${Math.abs(h) % 360}, 70%, 72%)`;
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

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${getToken()}`,
        },
    });
}