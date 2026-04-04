import { useEffect, useState } from "react";
import { getToken } from "../auth";
import "../styles/ui.css";

type User = {
    id: string;
    name: string;
    email: string;
};

export default function AdminPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/admin/users", {
            headers: { Authorization: `Bearer ${getToken()}` },
        })
            .then((r) => r.json())
            .then(setUsers)
            .catch(() => setError("Failed to load users"));
    }, []);

    async function deleteUser(id: string, name: string) {
        if (!confirm(`Delete user "${name}"?`)) return;

        const res = await fetch(`/api/admin/users/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (res.ok) {
            setUsers((prev) => prev.filter((u) => u.id !== id));
        } else {
            setError("Failed to delete user");
        }
    }

    return (
        <div className="p-8 max-w-[640px] mx-auto">
            <h2 className="text-text mb-5 text-lg font-semibold">Registered Users</h2>

            {error && (
                <p className="text-danger mb-4 text-[13px]">{error}</p>
            )}

            <div className="card p-0 overflow-hidden">
                {users.length === 0 ? (
                    <div className="empty-state p-8">No users found</div>
                ) : (
                    users.map((u, i) => (
                        <div
                            key={u.id}
                            className={`flex items-center px-4 py-3 gap-3 ${i < users.length - 1 ? "border-b border-border" : ""}`}
                        >
                            <div className="flex-1">
                                <div className="text-sm font-medium text-text">{u.name}</div>
                                <div className="text-xs text-muted">{u.email}</div>
                            </div>
                            <button
                                className="btn btn-danger text-xs px-3 py-1"
                                onClick={() => deleteUser(u.id, u.name)}
                            >
                                Delete
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
