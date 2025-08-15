import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  const signIn = async (e) => {
    e.preventDefault();
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMsg(error.message); return; }
    const { data, error: rpcErr } = await supabase.rpc('user_can_use_app');
    if (rpcErr) { setMsg(rpcErr.message); return; }
    if (!data) { setMsg('Not active or not in any group.'); return; }
    navigate('/me');
  };

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Welcome back</h1>
        <p className="text-sm text-slate-600 mb-6">Sign in to manage your expenses.</p>
        <form onSubmit={signIn} className="grid gap-3">
          <label className="text-sm text-slate-600">Email</label>
          <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />

          <label className="text-sm text-slate-600 mt-2">Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />

          <button className="btn mt-4" type="submit">Sign in</button>
        </form>
        {msg && <div className="text-red-600 mt-4">{msg}</div>}
      </div>
    </div>
  );
}
