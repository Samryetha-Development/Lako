"use client";
import { FormEvent, useState } from "react";

export default function Recover() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/password/reset/recovery-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: data.get("username"), code: data.get("code"), new_password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Recovery failed");
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recovery failed"); }
    finally { setBusy(false); }
  }
  return <main className="lako-auth lako-auth-main"><section className="lako-auth-login"><div className="lako-auth-panel"><div className="lako-auth-product">Lako</div><h1>Recover your account</h1>
    {done ? <p role="status">Password updated. Existing sessions have been signed out.</p> : <><p className="subtle">Use one of your 8 saved account recovery codes. This code will stop working after use. Existing two-factor authentication stays enabled.</p>
      <form onSubmit={submit}><label>Username<input name="username" autoComplete="username" required disabled={busy} /></label><label>Recovery code<input name="code" autoComplete="off" spellCheck={false} required disabled={busy} /></label>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy} /></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required disabled={busy} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}<button disabled={busy}>{busy ? "Saving…" : "Reset password"}</button></form></>}
    <a className="auth-link" href="/login">Back to sign in</a></div></section></main>;
}
