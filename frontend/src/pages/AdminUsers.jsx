import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AdminUsers() {
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [myId, setMyId] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');

  const [newUser, setNewUser] = useState({
    email: '', username: '', full_name: '', password: '', group_ids: []
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { nav('/login'); return; }
      setMyId(user.id);

      const { data: me } = await supabase.from('profile').select('is_superadmin').eq('user_id', user.id).single();
      if (!me?.is_superadmin) { nav('/dashboard'); return; }
      setIsAdmin(true);

      await loadAll();
      setLoading(false);
    })();
  }, [nav]);

  async function loadAll() {
    const [{ data: profs }, { data: gs }, { data: gms }] = await Promise.all([
      supabase.from('profile').select('user_id, username, full_name, email, is_active, is_superadmin').order('created_at', { ascending: true }),
      supabase.from('group').select('id,name').order('name', { ascending: true }),
      supabase.from('group_member').select('group_id, user_id'),
    ]);
    setProfiles(profs || []);
    setGroups(gs || []);
    setMemberships(gms || []);
  }

  // LIVE TYPING FIX: immutably update local state
  function editLocal(user_id, field, value) {
    setProfiles(prev => prev.map(p => p.user_id === user_id ? { ...p, [field]: value } : p));
  }

  const membershipMap = useMemo(() => {
    const map = new Map();
    for (const gm of memberships) {
      if (!map.has(gm.user_id)) map.set(gm.user_id, new Set());
      map.get(gm.user_id).add(gm.group_id);
    }
    return map;
  }, [memberships]);

  async function toggleActive(user_id, current) {
    const { error } = await supabase.from('profile').update({ is_active: !current }).eq('user_id', user_id);
    if (!error) await loadAll();
  }

  async function saveProfile(row) {
    const { error } = await supabase.from('profile')
      .update({ username: row.username, full_name: row.full_name, email: row.email })
      .eq('user_id', row.user_id);
    if (!error) await loadAll();
  }

  async function setGroupsForUser(user_id, selectedIds) {
    const current = membershipMap.get(user_id) || new Set();
    const next = new Set(selectedIds);
    const toAdd = [...next].filter(id => !current.has(id));
    const toDel = [...current].filter(id => !next.has(id));

    if (toAdd.length) {
      const rows = toAdd.map(gid => ({ group_id: gid, user_id }));
      await supabase.from('group_member').insert(rows);
    }
    for (const gid of toDel) {
      await supabase.from('group_member').delete().match({ group_id: gid, user_id });
    }
    await loadAll();
  }

  async function createUser() {
    setMsg('');
    setCreating(true);
    try {
      const { error } = await supabase.functions.invoke('provision_user', {
        body: {
          email: newUser.email,
          username: newUser.username,
          full_name: newUser.full_name,
          password: newUser.password,
          group_ids: newUser.group_ids
        }
      });
      if (error) throw error;
      setMsg('User created.');
      setNewUser({ email: '', username: '', full_name: '', password: '', group_ids: [] });
      await loadAll();
    } catch (e) {
      setMsg(e.message || 'Provision failed (check function + env vars).');
    } finally {
      setCreating(false);
    }
  }

  async function resetPassword(user_id) {
    const np = prompt('New password for this user?');
    if (!np) return;
    setMsg('');
    const { error } = await supabase.functions.invoke('admin_reset_password', {
      body: { user_id, password: np }
    });
    if (error) setMsg(error.message || 'Reset failed'); else setMsg('Password reset.');
  }

  async function deleteUser(user_id, is_superadmin) {
    if (is_superadmin) { alert('Cannot delete superadmin'); return; }
    if (user_id === myId) { alert('Cannot delete yourself'); return; }
    if (!confirm('Delete this user? This will remove auth, profile and memberships.')) return;
    setMsg('');
    const { error } = await supabase.functions.invoke('admin_delete_user', { body: { user_id } });
    if (error) setMsg(error.message || 'Delete failed'); else { setMsg('User deleted.'); await loadAll(); }
  }

  if (!isAdmin) return null;

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">User Management</h3>
          {msg && <div className="text-xs text-slate-500">{msg}</div>}
        </div>
        {/* Create (via Edge Function) */}
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          <input className="input md:col-span-2" placeholder="Email"
                 value={newUser.email} onChange={e=>setNewUser({...newUser, email:e.target.value})}/>
          <input className="input md:col-span-2" placeholder="Username"
                 value={newUser.username} onChange={e=>setNewUser({...newUser, username:e.target.value})}/>
          <input className="input md:col-span-2" placeholder="Full name"
                 value={newUser.full_name} onChange={e=>setNewUser({...newUser, full_name:e.target.value})}/>
          <input className="input md:col-span-2" type="password" placeholder="Initial password"
                 value={newUser.password} onChange={e=>setNewUser({...newUser, password:e.target.value})}/>
          <div className="md:col-span-3">
            <div className="text-xs mb-1">Groups</div>
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <label key={g.id} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox"
                         checked={newUser.group_ids.includes(g.id)}
                         onChange={e=>{
                           const set = new Set(newUser.group_ids);
                           if (e.target.checked) set.add(g.id); else set.delete(g.id);
                           setNewUser({...newUser, group_ids: [...set]});
                         }}/>
                  {g.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn md:col-span-1" onClick={createUser} disabled={creating}>Create</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
          <tr className="text-left">
            <th>User</th><th>Username</th><th>Full name</th><th>Email</th><th>Active</th><th>Groups</th><th className="text-right">Actions</th>
          </tr>
          </thead>
          <tbody>
          {profiles.map(p => {
            const sel = new Set(membershipMap.get(p.user_id) || []);
            return (
              <tr key={p.user_id}>
                <td className="text-xs">{p.user_id.slice(0,8)}…{p.is_superadmin ? ' (superadmin)' : ''}</td>
                <td>
                  <input className="input" value={p.username}
                         onChange={e=>editLocal(p.user_id, 'username', e.target.value)} />
                </td>
                <td>
                  <input className="input" value={p.full_name || ''}
                         onChange={e=>editLocal(p.user_id, 'full_name', e.target.value)} />
                </td>
                <td>
                  <input className="input" value={p.email}
                         onChange={e=>editLocal(p.user_id, 'email', e.target.value)} />
                </td>
                <td>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={p.is_active}
                           onChange={()=>toggleActive(p.user_id, p.is_active)} />
                    active
                  </label>
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {groups.map(g => (
                      <label key={g.id} className="inline-flex items-center gap-1 text-sm">
                        <input type="checkbox"
                               checked={sel.has(g.id)}
                               onChange={(e)=>{
                                 const next = new Set(sel);
                                 if (e.target.checked) next.add(g.id); else next.delete(g.id);
                                 setGroupsForUser(p.user_id, [...next]);
                               }}/>
                        {g.name}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="text-right">
                  <div className="inline-flex gap-2">
                    <button className="btn-ghost" onClick={()=>saveProfile(p)}>Save</button>
                    <button className="btn-ghost" onClick={()=>resetPassword(p.user_id)}>Reset PW</button>
                    <button className="btn-ghost"
                            disabled={p.is_superadmin || p.user_id === myId}
                            onClick={()=>deleteUser(p.user_id, p.is_superadmin)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {!profiles.length && <tr><td colSpan="7" className="py-4 text-slate-500">No users.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
