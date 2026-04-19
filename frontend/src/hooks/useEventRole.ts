import { useCallback, useEffect, useState } from "react";
import { authFetch, getUserIdFromToken } from "../auth";

export type Member = { user_id: string; username: string; role: string };

export function useEventRole(eventId: string | undefined) {
    const [members, setMembers] = useState<Member[]>([]);
    const [role, setRole] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!eventId) return;

        const res = await authFetch(`/api/events/${eventId}/members`);
        if (!res.ok) return;

        const list: Member[] = await res.json();
        setMembers(list);

        const me = list.find(m => m.user_id === getUserIdFromToken());
        setRole(me?.role ?? null);
    }, [eventId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { members, role, refresh };
}