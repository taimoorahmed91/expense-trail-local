import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Save, Trash2 } from 'lucide-react';

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState({ name: '', priority: '', color: '', icon: '' });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: prof } = await supabase.from('profile').select('is_superadmin').eq('user_id', session.user.id).single();
      setIsAdmin(!!prof?.is_superadmin);
      await refresh();
    })();
  }, []);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase
      .from('category')
      .select('id,name,color,icon,priority,is_active,created_at,updated_at')
      .order('priority', { ascending: true })
      .order('name', { ascending: true });
    setRows((data || []).map(r => ({ ...r, _dirty: false })));
    setLoading(false);
  }

  function edit(id, field, val) {
    setRows(rs => rs.map(r => r.id === id ? ({ ...r, [field]: val, _dirty: true }) : r));
  }

  async function saveRow(r) {
    if (!isAdmin) return;
    await supabase.from('category').update({
      name: r.name?.trim(),
      priority: Number.isFinite(+r.priority) ? +r.priority : 999,
      color: r.color || null,
      icon: r.icon || null,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    await refresh();
  }

  async function delRow(id) {
    if (!isAdmin) return;
    if (!confirm('Delete this category?')) return;
    await supabase.from('category').delete().eq('id', id);
    await refresh();
  }

  async function addNew() {
    if (!isAdmin) return;
    const name = adding.name.trim();
    if (!name) return;
    await supabase.from('category').insert({
      name,
      priority: Number.isFinite(+adding.priority) ? +adding.priority : 999,
      color: adding.color || null,
      icon: adding.icon || null,
    });
    setAdding({ name: '', priority: '', color: '', icon: '' });
    await refresh();
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        {!isAdmin && <span className="badge">Read-only</span>}
      </div>

      {isAdmin && (
        <div className="card">
          <div className="grid sm:grid-cols-5 gap-3">
            <input className="input" placeholder="Name" value={adding.name} onChange={e=>setAdding(a=>({...a,name:e.target.value}))}/>
            <input className="input" placeholder="Priority" type="number" value={adding.priority} onChange={e=>setAdding(a=>({...a,priority:e.target.value}))}/>
            <input className="input" placeholder="Color (hex)" value={adding.color} onChange={e=>setAdding(a=>({...a,color:e.target.value}))}/>
            <input className="input" placeholder="Icon name" value={adding.icon} onChange={e=>setAdding(a=>({...a,icon:e.target.value}))}/>
            <button className="btn flex items-center justify-center" onClick={addNew}>
              <Plus className="w-4 h-4 mr-2"/> Add
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-1/3">Name</th>
              <th>Priority</th>
              <th>Color</th>
              <th>Icon</th>
              <th className="text-right">{loading ? 'Loading…' : `${rows.length} items`}</th>
            </tr>
          </thead>
        </table>
        <div className="max-h-[60vh] overflow-auto">
          <table className="table">
            <tbody>
              {rows.map(r=>(
                <tr key={r.id}>
                  <td>
                    <input className="input" disabled={!isAdmin} value={r.name||''} onChange={e=>edit(r.id,'name',e.target.value)}/>
                  </td>
                  <td className="w-28">
                    <input className="input" disabled={!isAdmin} type="number" value={r.priority??''} onChange={e=>edit(r.id,'priority',e.target.value)}/>
                  </td>
                  <td className="w-40">
                    <input className="input" disabled={!isAdmin} value={r.color||''} onChange={e=>edit(r.id,'color',e.target.value)}/>
                  </td>
                  <td className="w-40">
                    <input className="input" disabled={!isAdmin} value={r.icon||''} onChange={e=>edit(r.id,'icon',e.target.value)}/>
                  </td>
                  <td className="text-right">
                    {isAdmin ? (
                      <div className="inline-flex gap-2">
                        <button className="icon-btn" title="Save" disabled={!r._dirty} onClick={()=>saveRow(r)}>
                          <Save className="icon" />
                        </button>
                        <button className="icon-btn icon-btn--danger" title="Delete" onClick={()=>delRow(r.id)}>
                          <Trash2 className="icon" />
                        </button>
                      </div>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan="5" className="text-center text-slate-500 py-6">No categories.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
