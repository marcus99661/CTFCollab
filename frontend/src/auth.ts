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

export function getUserIdFromToken(): string | null {
    const token = getToken();
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub ?? null;
    } catch {
        return null;
    }
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