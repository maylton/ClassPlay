"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { currentAccountEmail, deleteMyAccount, downloadMyData } from "@/lib/repositories/account-repository";

const CONFIRMATION = "DELETE";

export function AccountClient() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void currentAccountEmail().then(setEmail).catch(() => setEmail(null));
  }, []);

  async function exportData() {
    setBusy("export"); setError(""); setMessage("");
    try {
      await downloadMyData();
      setMessage("Your data file was downloaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export your data.");
    } finally { setBusy(null); }
  }

  async function removeAccount(event: FormEvent) {
    event.preventDefault();
    if (confirmText !== CONFIRMATION) return setError(`Type ${CONFIRMATION} to confirm.`);
    setBusy("delete"); setError(""); setMessage("");
    try {
      await deleteMyAccount();
      router.push("/?account=deleted");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete your account.");
      setBusy(null);
    }
  }

  if (email === undefined) return <main className="loading-screen">Loading your account…</main>;
  if (!email) {
    return <main className="account-screen"><section className="account-card"><span className="eyebrow">Account & data</span><h1>Sign in first.</h1><p>Sign in to download or delete the data linked to your ClassPlay account.</p><div className="account-actions"><Link className="button button-primary" href="/auth?next=/account">Teacher sign in</Link><Link className="button button-soft" href="/class/join">Student sign in</Link></div></section></main>;
  }

  return (
    <main className="account-screen">
      <section className="account-card">
        <span className="eyebrow">Account & data</span>
        <h1>Your data, your choice.</h1>
        <p>Signed in as <b>{email}</b>.</p>
        {message && <div className="account-message"><AppIcon name="check-circle-fill" /> {message}</div>}
        {error && <div className="alert-error">{error}</div>}

        <div className="account-section">
          <div><h2><AppIcon name="download" /> Download my data</h2><p>A JSON file with your profile, activities, classes, class memberships and results.</p></div>
          <button className="button button-soft" disabled={busy !== null} onClick={() => void exportData()}>{busy === "export" ? "Preparing…" : "Download"}</button>
        </div>

        <form className="account-section danger" onSubmit={(event) => void removeAccount(event)}>
          <div>
            <h2><AppIcon name="trash3" /> Delete my account</h2>
            <p>Permanently deletes your account and everything it owns: activities and their images, practice leaderboards, Community listings, classes you teach (with their assignments and results), your class memberships and results, and live rooms you hosted. This cannot be undone.</p>
            <label className="field"><span>Type {CONFIRMATION} to confirm</span><input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" /></label>
          </div>
          <button className="button button-danger" disabled={busy !== null || confirmText !== CONFIRMATION}>{busy === "delete" ? "Deleting…" : "Delete account"}</button>
        </form>
      </section>
    </main>
  );
}
