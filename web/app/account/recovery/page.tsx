"use client";
import { FormEvent, useEffect, useState } from "react";
import { RecoveryCodes } from "../../recovery-codes";

export default function AccountRecovery() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [totp, setTotp] = useState(false);
  useEffect(() => { fetch("/api/account/recovery-codes").then(async response => {
    if (!response.ok) throw new Error("Sign in to manage recovery codes.");
    const result = await response.json();
    setRemaining(result.remaining); setTotp(result.totp_enabled);
  }).catch(reason => setError(reason.message)); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    const csrf = decodeURIComponent(document.cookie.split("; ").find(value => value.startsWith("lako_csrf="))?.slice("lako_csrf=".length) ?? "");
    setBusy(true); setError("");
    try {
      if (data.get("code")) {
        const step = await fetch("/api/account/mfa/step-up", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ code: data.get("code") }) });
        const result = await step.json();
        if (!step.ok) throw new Error(result.error?.message ?? "Verification failed");
      }
      const response = await fetch("/api/account/recovery-codes", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Could not generate codes");
      setCodes(result.recovery_codes);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed"); }
    finally { setBusy(false); }
  }
  return <main className="lako-auth lako-auth-main"><section className="lako-auth-login"><div className="lako-auth-panel"><div className="lako-auth-product">Lako</div>
    {codes.length ? <RecoveryCodes codes={codes} onContinue={() => location.assign("/account/security")} /> : <><h1>Account recovery</h1><p className="subtle">{remaining === null ? "Loading…" : `${remaining} unused codes`}. Generate 8 new codes to reset a forgotten password. Generating a new set invalidates all previous account recovery codes.</p>
      <form onSubmit={submit}><label>Current password<input name="password" type="password" autoComplete="current-password" required disabled={busy || remaining === null} /></label>
        {totp && <label>Authenticator or 2FA backup code<input name="code" autoComplete="one-time-code" disabled={busy} /><span className="subtle">Required if your last two-factor verification was more than 10 minutes ago.</span></label>}
        {error && <div className="form-error" role="alert">{error}</div>}<button disabled={busy || remaining === null}>{busy ? "Generating…" : "Generate new codes"}</button></form>
      <a className="auth-link" href="/account/security">Back to security</a></>}
  </div></section></main>;
}
