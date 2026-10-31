import { useId, useRef, useState } from "react";
import { login } from "./access.js";
import { loadPeople } from "./adviserData.js";

// Restricted-area login form for the Advisers pages and the Adviser map (lazy chunk, R217; Gate and LockButton live in App.jsx). Credentials are checked in this browser (no request carries them) and kept nowhere.
export function Login() {
  const id = useId(), uRef = useRef(null), [u, setU] = useState(""), [p, setP] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const go = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setErr("");
    try { if (await login(u.trim(), p)) { setP(""); loadPeople().catch(() => {}); return; } setP(""); setErr("Wrong username or password"); } catch { setP(""); setErr("Wrong username or password"); }
    setBusy(false); uRef.current?.focus();
  };
  const cls = "mt-1 block min-h-11 w-full rounded-md border border-line bg-surface px-3 text-ink";
  return (
    <section className="mx-auto max-w-md text-center" data-login>
      <img src={import.meta.env.BASE_URL + "img/upou-seal-96.png"} width="48" height="48" alt="" className="mx-auto mb-3" />
      <h1 className="font-serif text-3xl font-light">Restricted</h1>
      <p className="mt-2 text-ink-2">Sign in to continue.</p>
      <form onSubmit={go} className="mt-4 space-y-4 text-left" aria-busy={busy}>
        <div><label htmlFor={id + "u"} className="text-sm font-medium">Username</label>
          <input id={id + "u"} name="username" ref={uRef} aria-describedby={id + "e"} type="text" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={128} value={u} onChange={(e) => setU(e.target.value)} className={cls} /></div>
        <div><label htmlFor={id + "p"} className="text-sm font-medium">Password</label>
          <input id={id + "p"} name="password" aria-describedby={id + "e"} type="password" autoComplete="current-password" required maxLength={128} value={p} onChange={(e) => setP(e.target.value)} className={cls} /></div>
        <p id={id + "e"} role="alert" aria-live="assertive" className="min-h-6 text-sm font-medium text-red-800">{err}</p>
        <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-action-fill px-6 font-medium text-white disabled:opacity-60">{busy ? "Checking…" : "Sign in"}</button>
      </form>
      <p className="mt-4 text-sm text-ink-2" data-login-note>Login is checked in your browser; nothing is sent. You stay signed in only until you press Lock, reload, close this tab or leave it idle for 15 minutes.</p>
    </section>
  );
}
