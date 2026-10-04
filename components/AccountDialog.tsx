"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
type Props = {username:string|null;close:()=>void;onSignedIn:()=>Promise<void>};
export default function AccountDialog({username:signedInName,close,onSignedIn}:Props) {
  const dialog=useRef<HTMLElement>(null);
  const [mode,setMode]=useState<"login"|"register"|"forgot">("login");
  const [username,setUsername]=useState("");const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");
  const [email,setEmail]=useState("");const [verifiedEmail,setVerifiedEmail]=useState<string|null>(null);
  const [remember,setRemember]=useState(true);const [configured,setConfigured]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  useEffect(()=>{let cancelled=false;fetch("/api/account/recovery").then(async r=>await r.json() as {configured:boolean;email:string|null}).then(data=>{if(!cancelled){setConfigured(data.configured===true);setVerifiedEmail(data.email);}}).catch(()=>{if(!cancelled)setConfigured(false);});return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    (dialog.current?.querySelector("input")||dialog.current?.querySelector("button"))?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){close();return;}if(event.key!=="Tab"||!dialog.current)return;const focusable=[...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),a[href]")];if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){event.preventDefault();focusable[0]?.focus();}};
    document.addEventListener("keydown",key);return()=>{document.removeEventListener("keydown",key);previous?.focus();};
  },[close]);
  const api=async(path:string,body:Record<string,unknown>)=>{const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await r.json() as {error?:string;message:string};if(!r.ok)throw Error(data.error||"Chưa xử lý được yêu cầu.");return data;};
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(mode==="register"&&password!==confirm){setError("Hai mật khẩu chưa khớp.");return;}
    setBusy(true);setError("");setMessage("");
    try {
      if(mode==="forgot"||signedInName){const result=await api("/api/account/recovery",{action:signedInName?"link":"forgot",email,password});setMessage(result.message);setPassword("");setBusy(false);return;}
      await api("/api/account",{action:mode,username,password,remember});
      if(mode==="register"&&email){try{const result=await api("/api/account/recovery",{action:"link",email,password});sessionStorage.setItem("chartlab:account-message",result.message);}catch(cause){sessionStorage.setItem("chartlab:account-message",`Tài khoản đã tạo. ${cause instanceof Error?cause.message:"Chưa gửi được thư xác minh."}`);}}
      setPassword("");setConfirm("");await onSignedIn();
    }catch(cause){setError(cause instanceof Error?cause.message:"Có lỗi khi xử lý.");setBusy(false);}
  };
  const changeMode=(value:typeof mode)=>{setMode(value);setPassword("");setConfirm("");setError("");setMessage("");};
  return <div className="account-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section ref={dialog} className="account-dialog" role="dialog" aria-modal="true" aria-label="Tài khoản Chart Lab">
    <button className="account-close" type="button" onClick={close} aria-label="Đóng"><X size={18}/></button><span className="panel-eyebrow">CHART LAB</span>
    <h2>{signedInName?`Tài khoản ${signedInName}`:mode==="register"?"Tạo tài khoản":mode==="forgot"?"Quên mật khẩu":"Đăng nhập"}</h2>
    <p>{signedInName?"Watchlist, cài đặt và chỉ báo được lưu theo tài khoản.":mode==="forgot"?"Nhập email đã xác minh của tài khoản để nhận liên kết đặt lại mật khẩu.":"Dùng cùng tài khoản trên điện thoại và máy tính để đồng bộ dữ liệu."}</p>
    {!signedInName&&mode!=="forgot"&&<div className="account-modes"><button type="button" onClick={()=>changeMode("login")} className={mode==="login"?"active":""}>Đăng nhập</button><button type="button" onClick={()=>changeMode("register")} className={mode==="register"?"active":""}>Tạo tài khoản</button></div>}
    {signedInName&&<p>Email khôi phục: <strong>{verifiedEmail||"Chưa xác minh"}</strong></p>}
    {configured===false&&<p className="account-warning">Web chưa cấu hình gửi email. {signedInName||mode==="forgot"?"Chức năng khôi phục sẽ hoạt động sau khi chủ web cấu hình.":"Bạn vẫn có thể tạo tài khoản và đăng nhập."}</p>}
    <form onSubmit={submit}>
      {!signedInName&&mode!=="forgot"&&<label>Tên tài khoản<input name="username" required autoComplete="username" autoCapitalize="none" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={e=>setUsername(e.target.value)}/></label>}
      {(signedInName||mode!=="forgot")&&<label>{signedInName?"Mật khẩu hiện tại":"Mật khẩu"}<input name="password" required type="password" autoComplete={mode==="register"?"new-password":"current-password"} minLength={10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      {!signedInName&&mode==="register"&&<label>Nhập lại mật khẩu<input name="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
      {(signedInName||mode!=="login")&&<label>Email {mode==="register"?"khôi phục (tùy chọn)":"khôi phục"}<input name="email" type="email" required={mode!=="register"} autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      {!signedInName&&mode!=="forgot"&&<label className="remember-login"><input name="remember" type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Ghi nhớ đăng nhập trong 30 ngày</label>}
      {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-success" role="status">{message}</p>}
      <button className="account-submit" disabled={busy||((!!signedInName||mode==="forgot")&&configured!==true)}>{busy?"Đang xử lý…":signedInName?"Gửi thư xác minh email":mode==="register"?"Tạo tài khoản":mode==="forgot"?"Gửi liên kết khôi phục":"Đăng nhập"}</button>
    </form>
    {!signedInName&&<button type="button" className="account-link" onClick={()=>changeMode(mode==="forgot"?"login":"forgot")}>{mode==="forgot"?"Quay lại đăng nhập":"Quên mật khẩu?"}</button>}
    {signedInName&&<button type="button" className="account-link" disabled={busy} onClick={async()=>{setBusy(true);try{await api("/api/account",{action:"logout"});window.location.reload();}catch(cause){setError(cause instanceof Error?cause.message:"Không đăng xuất được.");setBusy(false);}}}>Đăng xuất</button>}
    <small>{signedInName?"Nhập mật khẩu hiện tại để thêm hoặc thay email. Xác minh bằng liên kết trong thư trước khi khôi phục mật khẩu.":"Trình duyệt có thể lưu mật khẩu cho bạn. Web chỉ lưu phiên đăng nhập; email cần được xác minh để khôi phục."}</small>
  </section></div>;
}
