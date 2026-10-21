"use client";
import { useState } from "react";

export function RecoveryCodes({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  function download() {
    const url = URL.createObjectURL(new Blob(["Lako account recovery codes\nEach code resets your password once. Keep this file private.\n\n" + codes.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url; link.download = "lako-account-recovery-codes.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><h1>Save your recovery codes</h1><p className="subtle">These 8 codes are shown once. Each code can reset your password once. They are separate from two-factor authentication codes.</p>
    <pre style={{ whiteSpace: "pre-wrap", lineHeight: 2 }}>{codes.join("\n")}</pre>
    <button type="button" className="row-action" onClick={download}>Download codes</button>
    <label style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}><input style={{ width: "auto" }} type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have saved my recovery codes</label>
    <button type="button" disabled={!saved} onClick={onContinue}>Continue</button></>;
}
