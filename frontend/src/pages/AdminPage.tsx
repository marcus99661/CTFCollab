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
        fetch("/admin/users", {
            headers: { Authorization: `Bearer ${getToken()}` },
        })
            .then((r) => r.json())
            .then(setUsers)
            .catch(() => setError("Failed to load users"));
    }, []);

    async function deleteUser(id: string, name: string) {
        if (!confirm(`Delete user "${name}"?`)) return;

        const res = await fetch(`/admin/users/${id}`, {
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
        <div style={{ padding: 32, maxWidth: 640, margin: "0 auto" }}>
            <h2 style={{ color: "var(--text)", marginBottom: 20, fontSize: 18, fontWeight: 600 }}>Registered Users</h2>

            {error && (
                <p style={{ color: "var(--danger)", marginBottom: 16, fontSize: 13 }}>{error}</p>
            )}

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {users.length === 0 ? (
                    <div className="empty-state" style={{ padding: 32 }}>No users found</div>
                ) : (
                    users.map((u, i) => (
                        <div
                            key={u.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "12px 16px",
                                borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none",
                                gap: 12,
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{u.name}</div>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>{u.email}</div>
                            </div>
                            <button
                                className="btn btn-danger"
                                onClick={() => deleteUser(u.id, u.name)}
                                style={{ fontSize: 12, padding: "4px 12px" }}
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
