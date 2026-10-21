"use client";
import { FormEvent, useState } from "react";
import { RecoveryCodes } from "../recovery-codes";

function loginHref() {
  const value = new URLSearchParams(location.search).get("return_to");
  return value?.startsWith("/oauth/authorize?") ? `/login?return_to=${encodeURIComponent(value)}` : "/login";
}

export default function Register() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Registration failed");
      setCodes(result.recovery_codes);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Registration failed"); }
    finally { setBusy(false); }
  }
  return <main className="lako-auth lako-auth-main"><section className="lako-auth-login"><div className="lako-auth-panel">
    <div className="lako-auth-product">Lako</div>
    {codes.length ? <RecoveryCodes codes={codes} onContinue={() => location.assign(loginHref())} /> : <><h1>Create account</h1><p className="subtle">Choose a username and password. You can sign in immediately.</p>
      <form onSubmit={submit}><label>Username<input name="username" autoComplete="username" minLength={3} maxLength={32} required disabled={busy} /></label>
        <label>Password<input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required disabled={busy} /></label>
        <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required disabled={busy} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}<button disabled={busy}>{busy ? "Creating…" : "Create account"}</button></form>
      <a className="auth-link" href="/login" onClick={event => { event.preventDefault(); location.assign(loginHref()); }}>Already have an account</a></>}
  </div></section></main>;
}
