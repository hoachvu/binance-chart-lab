"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

type Props = { username: string | null; close: () => void; onSignedIn: () => Promise<void> };

export default function AccountDialog({ username: signedInName, close, onSignedIn }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (dialog.current?.querySelector("input") || dialog.current?.querySelector("button"))?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)")];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [close]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "register" && password !== confirm) { setError("Hai mật khẩu chưa khớp."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, username, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "Không đăng nhập được.");
      await onSignedIn();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Có lỗi khi đăng nhập."); setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw Error("Không đăng xuất được.");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Có lỗi khi đăng xuất."); setBusy(false); }
  };

  return <div className="account-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialog} className="account-dialog" role="dialog" aria-modal="true" aria-label={signedInName ? "Tài khoản" : "Đăng nhập Chart Lab"}>
      <button type="button" className="account-close" onClick={close} aria-label="Đóng"><X size={18}/></button>
      {signedInName ? <>
        <span className="panel-eyebrow">CHART LAB</span><h2>Tài khoản {signedInName}</h2>
        <p>Watchlist, cài đặt biểu đồ và chỉ báo của bạn được lưu theo tài khoản để dùng trên các thiết bị.</p>
        <button type="button" className="account-submit" onClick={logout} disabled={busy}>Đăng xuất</button>
      </> : <>
        <span className="panel-eyebrow">CHART LAB</span><h2>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
        <p>Dùng cùng tên tài khoản trên điện thoại và máy tính để đồng bộ watchlist, cài đặt và chỉ báo.</p>
        <div className="account-modes"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Đăng nhập</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Tạo tài khoản</button></div>
        <form onSubmit={submit}>
          <label>Tên tài khoản<input required autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={event => setUsername(event.target.value)} placeholder="Ví dụ: hoachvu"/></label>
          <label>Mật khẩu<input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)}/></label>
          {mode === "register" && <label>Nhập lại mật khẩu<input required type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)}/></label>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <button type="submit" className="account-submit" disabled={busy}>{busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button>
        </form>
        <small>{mode === "register" ? "Mật khẩu tối thiểu 10 ký tự. Hiện chưa có chức năng khôi phục mật khẩu; hãy lưu mật khẩu ở nơi an toàn." : "Lần đầu đăng nhập? Chọn Tạo tài khoản."}</small>
      </>}
      {signedInName && error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>;
}
