"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginView() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [setupToken, setSetupToken] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [bootstrap, setBootstrap] = useState<boolean | null>(null);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const endpoint = bootstrap ? "/api/auth/bootstrap" : "/api/auth/login";
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password, setup_token: setupToken }),
            });
            if (!response.ok) {
                const json = (await response.json().catch(() => ({}))) as { error?: string };
                if (json.error === "BOOTSTRAP_CLOSED") setBootstrap(false);
                setError(json.error ?? "LOGIN_FAILED");
                return;
            }
            router.replace("/");
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    async function probe() {
        try {
            const response = await fetch("/api/auth/me");
            if (response.status === 401) {
                const check = await fetch("/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
                const checkBody = await check.json().catch(() => ({})) as { error?: string };
                if (check.status === 403 && checkBody.error === "BOOTSTRAP_CLOSED") setBootstrap(false);
                else if (check.status === 403) setBootstrap(true);
            }
        } catch { /* offline check keeps the login form usable. */ }
    }
    void probe();

    return (
        <div className="hf-login">
            <div className="hf-login-card">
                <span className="hf-brand-mark" aria-hidden="true"><i /><i /><i /></span>
                <h1>{bootstrap ? "Create the admin account" : "Sign in"}</h1>
                <p className="hf-login-sub">{bootstrap ? "The first account owns this deployment and manages users from the admin console." : "HighField workspace access"}</p>
                <form onSubmit={submit} className="hf-login-form">
                    <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                    <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={bootstrap ? "new-password" : "current-password"} /></label>
                {bootstrap && <label>Setup token<input type="password" required value={setupToken} onChange={(e) => setSetupToken(e.target.value)} autoComplete="one-time-code" /></label>}
                    {error && <p role="alert" className="hf-login-error">{error === "INVALID_CREDENTIALS" ? "Email or password is incorrect." : error === "WEAK_PASSWORD" ? "Password must be at least 8 characters." : error === "INVALID_EMAIL" ? "Enter a valid email address." : "Sign-in failed. Try again."}</p>}
                    <button type="submit" disabled={busy} className="hf-login-submit">{busy ? "Working…" : bootstrap ? "Create admin" : "Sign in"}</button>
                </form>
            </div>
        </div>
    );
}
