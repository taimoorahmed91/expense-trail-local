import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AdminGroups() {
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [groups, setGroups] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { nav('/login'); return; }
      const { data: me } = await supabase.from('profile').select('is_superadmin').eq('user_id', user.id).single();
      if (!me?.is_superadmin) { nav('/dashboard'); return; }
      setIsAdmin(true);
      await loadAll();
    })();
  }, [nav]);

  async function loadAll() {
    const [{ data: gs }, { data: profs }, { data: gms }] = await Promise.all([
      supabase.from('group').select('id,name').order('name', { ascending: true }),
      supabase.from('profile').select('user_id, full_name, username, email').order('username', { ascending: true }),
      supabase.from('group_member').select('group_id,user_id')
    ]);
    setGroups(gs || []);
    setProfiles(profs || []);
    setMemberships(gms || []);
  }

  const membersByGroup = useMemo(() => {
    const map = new Map();
    for (const gm of memberships) {
      if (!map.has(gm.group_id)) map.set(gm.group_id, new Set());
      map.get(gm.group_id).add(gm.user_id);
    }
    return map;
  }, [memberships]);

  async function createGroup() {
    if (!newGroupName.trim()) return;
    const { error } = await supabase.from('group').insert({ name: newGroupName.trim() });
    if (error) { setMsg(error.message); return; }
    setNewGroupName('');
    await loadAll();
  }

  async function renameGroup(id, name) {
    const { error } = await supabase.from('group').update({ name }).eq('id', id);
    if (!error) await loadAll();
  }

  async function deleteGroup(id, name) {
    if (name === 'superadmingroup') { alert('Immutable group cannot be deleted.'); return; }
    if (!confirm(`Delete group "${name}"?`)) return;
    const { error } = await supabase.from('group').delete().eq('id', id);
    if (!error) await loadAll();
  }

  async function setMembers(id, nextUserIds) {
    const current = membersByGroup.get(id) || new Set();
    const next = new Set(nextUserIds);
    const toAdd = [...next].filter(u => !current.has(u));
    const toDel = [...current].filter(u => !next.has(u));

    if (toAdd.length) {
      const rows = toAdd.map(uid => ({ group_id: id, user_id: uid }));
      await supabase.from('group_member').insert(rows);
    }
    for (const uid of toDel) {
      await supabase.from('group_member').delete().match({ group_id: id, user_id: uid });
    }
    await loadAll();
  }

  if (!isAdmin) return null;

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Group Management</h3>
          {msg && <div className="text-xs text-slate-500">{msg}</div>}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          <input className="input md:col-span-4" placeholder="New group name"
                 value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} />
          <button className="btn md:col-span-2" onClick={createGroup}>Create Group</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
          <tr className="text-left"><th>Name</th><th>Members</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody>
          {groups.map(g => {
            const sel = new Set(membersByGroup.get(g.id) || []);
            return (
              <tr key={g.id}>
                <td>
                  <input
                    className="input"
                    defaultValue={g.name}
                    onBlur={(e)=>{ if (e.target.value !== g.name) renameGroup(g.id, e.target.value); }}
                    readOnly={g.name === 'superadmingroup'}
                  />
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {profiles.map(p => (
                      <label key={p.user_id} className="inline-flex items-center gap-1 text-sm">
                        <input type="checkbox"
                               checked={sel.has(p.user_id)}
                               onChange={(e)=>{
                                 const next = new Set(sel);
                                 if (e.target.checked) next.add(p.user_id); else next.delete(p.user_id);
                                 setMembers(g.id, [...next]);
                               }}/>
                        {p.full_name || p.username || p.email}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="text-right">
                  <button className="btn-ghost"
                          disabled={g.name === 'superadmingroup'}
                          onClick={()=>deleteGroup(g.id, g.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          {!groups.length && <tr><td colSpan="3" className="py-4 text-slate-500">No groups.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
