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

type AdminModelFeature = {
    feature: string;
    label: string;
    mode: "catalog" | "identifier" | "planning";
    providerEngine?: string;
    choices?: Array<{ id: string; label: string }>;
};

type AdminModelSetting = {
    feature: string;
    model_id: string;
    provider_engine?: string;
    updated_at: string;
};

export function AdminConsole() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<"user" | "admin">("user");
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [features, setFeatures] = useState<AdminModelFeature[]>([]);
    const [modelValues, setModelValues] = useState<Record<string, string>>({});
    const [engineValues, setEngineValues] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        const response = await fetch("/api/admin/users");
        if (response.status === 401 || response.status === 403) {
            setStatus("Admin access required");
            return;
        }
        const data = await response.json() as { users?: AdminUser[] };
        setUsers(data.users ?? []);
        const modelResponse = await fetch("/api/admin/models");
        if (modelResponse.ok) {
            const modelData = await modelResponse.json() as { features?: AdminModelFeature[]; settings?: AdminModelSetting[] };
            const settings = modelData.settings ?? [];
            setFeatures(modelData.features ?? []);
            setModelValues(Object.fromEntries(settings.map(setting => [setting.feature, setting.model_id])));
            setEngineValues(Object.fromEntries(settings.filter(setting => setting.provider_engine).map(setting => [setting.feature, setting.provider_engine as string])));
        }
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

    async function saveModel(feature: AdminModelFeature) {
        setBusy(true); setStatus(null);
        try {
            const response = await fetch("/api/admin/models", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    feature: feature.feature,
                    model_id: modelValues[feature.feature] ?? "",
                    provider_engine: engineValues[feature.feature] ?? feature.providerEngine,
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as { error?: string };
                setStatus(data.error === "ERR_INVALID_MODEL_ID" ? "Choose a valid model." : data.error ?? "Model update failed");
                return;
            }
            setStatus("Model updated");
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
            <section className={styles.adminCard} aria-labelledby="model-heading">
                <header><p className={styles.adminEyebrow}>ADMIN CONSOLE</p><h1 id="model-heading">Models</h1><p className={styles.adminSub}>Set the model each workflow uses when the studio is left on Admin default.</p></header>
                <div className={styles.adminFeatureList}>
                    {features.map(feature => (
                        <form className={styles.adminForm} key={feature.feature} onSubmit={event => { event.preventDefault(); void saveModel(feature); }}>
                            <label>{feature.label}
                                {feature.mode === "catalog" ? (
                                    <select value={modelValues[feature.feature] ?? ""} onChange={event => setModelValues(current => ({ ...current, [feature.feature]: event.target.value }))}>
                                        <option value="">Not set</option>
                                        {feature.choices?.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                                    </select>
                                ) : (
                                    <input value={modelValues[feature.feature] ?? ""} maxLength={200} placeholder={feature.mode === "identifier" ? "provider/model" : "installed model"} onChange={event => setModelValues(current => ({ ...current, [feature.feature]: event.target.value }))} />
                                )}
                            </label>
                            {feature.mode === "planning" && <label>Engine<select value={engineValues[feature.feature] ?? "ollama"} onChange={event => setEngineValues(current => ({ ...current, [feature.feature]: event.target.value }))}><option value="ollama">Ollama</option><option value="lm-studio">LM Studio</option></select></label>}
                            <button type="submit" disabled={busy}>Save</button>
                        </form>
                    ))}
                </div>
            </section>
        </main>
    );
}
