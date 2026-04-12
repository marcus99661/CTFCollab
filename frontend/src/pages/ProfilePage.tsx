import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch, clearToken, clearCollabUser } from "../auth";
import { getDb, resetDb } from "../db";
import "../styles/ui.css";

export default function ProfilePage() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);

    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        authFetch("/api/profile")
            .then(r => r.json())
            .then(d => setUsername(d.username))
            .catch(() => {});
    }, []);

    async function changePassword() {
        setPasswordError(null);
        setPasswordSuccess(false);
        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match");
            return;
        }
        setPasswordSaving(true);
        try {
            const res = await authFetch("/api/profile/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setPasswordError(json.error ?? "Failed to change password"); return; }
            setPasswordSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            setPasswordError("Could not reach server");
        } finally {
            setPasswordSaving(false);
        }
    }

    async function deleteAccount() {
        setDeleteError(null);
        setDeleting(true);
        try {
            const res = await authFetch("/api/profile", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: deletePassword }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setDeleteError(json.error ?? "Failed to delete account"); return; }

            const db = await getDb();
            await db.remove();
            resetDb();
            clearToken();
            clearCollabUser();
            localStorage.removeItem("eventsCheckpoint");
            localStorage.removeItem("challengesCheckpoint");
            localStorage.removeItem("notesCheckpoint");
            navigate("/login");
        } catch {
            setDeleteError("Could not reach server");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="max-w-[520px] mx-auto my-8 px-4 flex flex-col gap-6">
            <h2 className="text-text font-semibold text-xl m-0">{username}</h2>

            <div className="panel">
                <div className="panel-header">Change password</div>
                <div className="panel-body">
                    <label className="form-field">
                        <span className="form-field-label">Current password</span>
                        <input
                            className="input"
                            type="password"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">New password</span>
                        <input
                            className="input"
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </label>
                    <label className="form-field">
                        <span className="form-field-label">Confirm new password</span>
                        <input
                            className="input"
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            onKeyDown={e => { if (e.key === "Enter") changePassword(); }}
                        />
                    </label>
                    {passwordError && <p className="text-danger text-[13px] m-0">{passwordError}</p>}
                    {passwordSuccess && <p className="text-success text-[13px] m-0">Password changed successfully.</p>}
                    <div className="form-actions">
                        <button
                            className="btn btn-primary"
                            onClick={changePassword}
                            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                        >
                            {passwordSaving ? "Saving..." : "Change password"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="panel border-danger/40">
                <div className="panel-header text-danger">Delete account</div>
                <div className="panel-body">
                    <p className="text-[13px] text-muted m-0">
                        This permanently deletes your account. You must delete any events you own first.
                    </p>
                    {!deleteConfirm ? (
                        <div className="form-actions mt-1">
                            <button className="btn btn-danger" onClick={() => setDeleteConfirm(true)}>
                                Delete account
                            </button>
                        </div>
                    ) : (
                        <>
                            <label className="form-field mt-1">
                                <span className="form-field-label">Confirm your password</span>
                                <input
                                    className="input"
                                    type="password"
                                    value={deletePassword}
                                    onChange={e => setDeletePassword(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === "Enter") deleteAccount(); }}
                                />
                            </label>
                            {deleteError && <p className="text-danger text-[13px] m-0">{deleteError}</p>}
                            <div className="form-actions">
                                <button
                                    className="btn btn-danger"
                                    onClick={deleteAccount}
                                    disabled={deleting || !deletePassword}
                                >
                                    {deleting ? "Deleting..." : "Confirm delete"}
                                </button>
                                <button className="btn" onClick={() => { setDeleteConfirm(false); setDeletePassword(""); setDeleteError(null); }}>
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
