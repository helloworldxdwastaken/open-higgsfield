"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./admin.module.css";

type AdminUser = {
    id: string;
    email: string;
    role: "admin" | "user";
    active: boolean;
    created_at: string;
    storage_used: string | null;
};

export function AdminConsole() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<"user" | "admin">("user");
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const response = await fetch("/api/admin/users");
        if (response.status === 401 || response.status === 403) {
            setStatus("Admin access required");
            return;
        }
        const data = await response.json() as { users?: AdminUser[] };
        setUsers(data.users ?? []);
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function createUser(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true); setStatus(null);
        try {
            const response = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password, role }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as { error?: string };
                setStatus(data.error === "WEAK_PASSWORD" ? "Password must be at least 8 characters." : data.error ?? "Create failed");
                return;
            }
            setEmail(""); setPassword("");
            setStatus("User created");
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function toggleUser(user: AdminUser) {
        setBusy(true); setStatus(null);
        try {
            const response = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ user_id: user.id, active: !user.active }),
            });
            if (!response.ok) setStatus("Update failed");
            await load();
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className={styles.adminShell}>
            <section className={styles.adminCard} aria-labelledby="admin-heading">
                <header><p className={styles.adminEyebrow}>ADMIN CONSOLE</p><h1 id="admin-heading">Users</h1><p className={styles.adminSub}>Create workspace accounts and control access.</p></header>
                <form className={styles.adminForm} onSubmit={createUser}>
                    <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
                    <label>Temporary password<input type="password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></label>
                    <label>Role<select value={role} onChange={event => setRole(event.target.value as "admin" | "user")}><option value="user">User</option><option value="admin">Admin</option></select></label>
                    <button type="submit" disabled={busy}>{busy ? "Working…" : "Create user"}</button>
                </form>
                {status && <p className={styles.adminStatus} role="status">{status}</p>}
                <div className={styles.adminTableWrap}>
                    <table className={styles.adminTable}>
                        <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Task storage</th><th>Created</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>{user.email}</td><td>{user.role}</td><td><span className={user.active ? styles.adminActive : styles.adminInactive}>{user.active ? "Active" : "Inactive"}</span></td>
                                    <td>{user.storage_used ? `${Math.round(Number(user.storage_used) / 1024)} KB` : "0 KB"}</td>
                                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td><button type="button" disabled={busy} onClick={() => void toggleUser(user)}>{user.active ? "Deactivate" : "Activate"}</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!users.length && <p className={styles.adminEmpty}>No accounts are visible yet.</p>}
                </div>
            </section>
        </main>
    );
}
