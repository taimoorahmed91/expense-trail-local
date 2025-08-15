// src/pages/Budget.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

export default function Budget() {
  const { mode } = useViewMode(); // 'my' | 'group'
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null); // {id,name}
  const [isGroupMember, setIsGroupMember] = useState(false);

  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [form, setForm] = useState({
    scope: 'category',          // 'category' | 'all'
    category_id: '',
    frequency: 'monthly',       // weekly | monthly | yearly
    amount: '',
    currency: 'PLN',
    note: ''
  });

  useEffect(() => {
    (async () => {
      // auth + admin
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u || null);
      const { data: prof } = u
        ? await supabase.from('profile').select('is_superadmin').eq('user_id', u.id).maybeSingle()
        : { data: null };
      const admin = !!prof?.is_superadmin;
      setIsAdmin(admin);

      // categories
      const { data: catRows } = await supabase
        .from('category')
        .select('id,name,priority,is_active')
        .eq('is_active', true)
        .order('priority', { ascending: true });
      setCats(catRows || []);

      // groups (only when in group mode)
      let active = null;
      let list = [];
      if (mode === 'group') {
        // try localStorage first
        const storedId = localStorage.getItem('active_group_id');
        const storedName = localStorage.getItem('active_group_name');

        if (admin) {
          const { data } = await supabase.from('group').select('id,name').order('name');
          list = data || [];
        } else if (u?.id) {
          const { data: mems } = await supabase.from('group_member').select('group_id').eq('user_id', u.id);
          const ids = (mems || []).map(m => m.group_id);
          const { data } = ids.length
            ? await supabase.from('group').select('id,name').in('id', ids).order('name')
            : { data: [] };
          list = data || [];
        }
        setGroups(list);

        // pick active
        if (storedId && storedName && list.some(g => g.id === storedId)) {
          active = { id: storedId, name: storedName };
        } else if (list.length) {
          active = list[0];
          localStorage.setItem('active_group_id', active.id);
          localStorage.setItem('active_group_name', active.name);
        }
        setGroup(active);

        // membership flag (admin counts as member for edit)
        if (active?.id && u?.id && !admin) {
          const { data: mem } = await supabase
            .from('group_member')
            .select('user_id')
            .eq('group_id', active.id)
            .eq('user_id', u.id)
            .maybeSingle();
          setIsGroupMember(!!mem);
        } else {
          setIsGroupMember(admin);
        }
      } else {
        setGroups([]);
        setGroup(null);
        setIsGroupMember(false);
      }

      await refresh(u || user, mode, active?.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function refresh(u, m, gid) {
    setLoading(true);
    if (m === 'group') {
      const g = gid || group?.id;
      if (!g) { setRows([]); setLoading(false); return; }
      const { data, error } = await supabase
        .from('group_budget')
        .select('id, group_id, all_categories, category_id, frequency, amount, currency, note, updated_at, category:category_id(name)')
        .eq('group_id', g)
        .order('updated_at', { ascending: false });
      if (error) console.error(error);
      setRows(data || []);
    } else {
      const { data, error } = await supabase
        .from('user_budget')
        .select('id, user_id, all_categories, category_id, frequency, amount, currency, note, updated_at, category:category_id(name)')
        .order('updated_at', { ascending: false });
      if (error) console.error(error);
      setRows(data || []);
    }
    setLoading(false);
  }

  async function pickGroup(id) {
    const g = groups.find(x => x.id === id) || null;
    if (g) {
      localStorage.setItem('active_group_id', g.id);
      localStorage.setItem('active_group_name', g.name);
    }
    setGroup(g);

    // recompute membership
    if (isAdmin) setIsGroupMember(true);
    else if (g?.id && user?.id) {
      const { data: mem } = await supabase
        .from('group_member')
        .select('user_id')
        .eq('group_id', g.id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsGroupMember(!!mem);
    } else setIsGroupMember(false);

    await refresh(user, 'group', g?.id);
  }

  async function addBudget() {
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt < 0) { alert('Enter a valid amount'); return; }
    const scopeAll = form.scope === 'all';
    const combo = {
      frequency: form.frequency,
      all_categories: scopeAll,
      category_id: scopeAll ? null : (form.category_id || null),
    };

    // UI-level duplicate check within current rows
    const dupe = rows.some(r =>
      r.frequency === combo.frequency &&
      r.all_categories === combo.all_categories &&
      (r.category_id || null) === (combo.category_id || null)
    );
    if (dupe) { alert('A budget for this scope & frequency already exists. Edit the existing one.'); return; }

    if (mode === 'group') {
      if (!isAdmin) { alert('Only superadmin can create group budgets.'); return; }
      if (!group?.id) { alert('No group selected.'); return; }
      const { error } = await supabase.from('group_budget').insert({
        group_id: group.id,
        ...combo,
        amount: amt,
        currency: (form.currency || 'PLN').toUpperCase().slice(0,3),
        note: form.note || null,
      });
      if (error) { alert(error.message); return; }
    } else {
      if (!user?.id) return;
      const { error } = await supabase.from('user_budget').insert({
        user_id: user.id,
        ...combo,
        amount: amt,
        currency: (form.currency || 'PLN').toUpperCase().slice(0,3),
        note: form.note || null,
      });
      if (error) { alert(error.message); return; }
    }

    setForm(f => ({ ...f, amount: '', note: '' }));
    await refresh(user, mode, group?.id);
  }

  async function saveRow(r) {
    const amt = Number(r.amount);
    if (!Number.isFinite(amt) || amt < 0) { alert('Amount must be a number'); return; }

    const payload = {
      amount: amt,
      currency: (r.currency || 'PLN').toUpperCase().slice(0,3),
      frequency: r.frequency,
      note: r.note || null,
      all_categories: r.all_categories,
      category_id: r.all_categories ? null : r.category_id || null,
      updated_at: new Date().toISOString()
    };

    if (mode === 'group') {
      const { error } = await supabase.from('group_budget').update(payload).eq('id', r.id);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('user_budget').update(payload).eq('id', r.id);
      if (error) { alert(error.message); return; }
    }
    await refresh(user, mode, group?.id);
  }

  async function delRow(id) {
    if (!confirm('Delete this budget?')) return;
    if (mode === 'group') {
      const { error } = await supabase.from('group_budget').delete().eq('id', id);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('user_budget').delete().eq('id', id);
      if (error) { alert(error.message); return; }
    }
    await refresh(user, mode, group?.id);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => {
      const name = r.all_categories ? 'All categories' : (r.category?.name || '');
      return name.toLowerCase().includes(term) || r.frequency.toLowerCase().includes(term);
    });
  }, [rows, q]);

  const canCreate = mode === 'my' || (mode === 'group' && isAdmin);

  return (
    <div className="grid gap-6">
      {/* Header with group badge + switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Budget</h1>
        <div className="flex items-center gap-3">
          {mode === 'group' && (
            <>
              <span className="badge whitespace-nowrap">Group: {group?.name || '—'}</span>
              <select
                className="select w-56"
                value={group?.id || (groups[0]?.id || '')}
                onChange={(e) => pickGroup(e.target.value)}
              >
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </>
          )}
          <input
            className="input w-64"
            placeholder="Search (name / frequency)"
            value={q}
            onChange={e=>setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Create */}
      <div className="card">
        <div className="grid md:grid-cols-8 gap-3">
          <select
            className="select md:col-span-2"
            value={form.scope}
            onChange={e=>setForm(f=>({ ...f, scope: e.target.value }))}
            disabled={!canCreate}
          >
            <option value="category">Category budget</option>
            <option value="all">All categories</option>
          </select>

          <select
            className="select md:col-span-2"
            value={form.category_id}
            onChange={e=>setForm(f=>({ ...f, category_id: e.target.value }))}
            disabled={form.scope === 'all' || !canCreate}
          >
            <option value="">(select category)</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className="select"
            value={form.frequency}
            onChange={e=>setForm(f=>({ ...f, frequency: e.target.value }))}
            disabled={!canCreate}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <input
            className="input tabular-nums"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="Amount"
            value={form.amount}
            onChange={e=>setForm(f=>({ ...f, amount: e.target.value }))}
            disabled={!canCreate}
          />

          <input
            className="input"
            placeholder="CUR"
            value={form.currency}
            onChange={e=>setForm(f=>({ ...f, currency: e.target.value.toUpperCase().slice(0,3) }))}
            disabled={!canCreate}
          />

          <input
            className="input md:col-span-2"
            placeholder="Note (optional)"
            value={form.note}
            onChange={e=>setForm(f=>({ ...f, note: e.target.value }))}
            disabled={!canCreate}
          />

          <div className="md:col-span-1">
            <button className="btn w-full" onClick={addBudget} disabled={!canCreate}>Add</button>
          </div>
        </div>
        {mode === 'group' && !isAdmin && (
          <div className="mt-2 text-xs text-slate-500">
            Creating group budgets is superadmin-only. Members can edit existing ones.
          </div>
        )}
      </div>

      {/* List */}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr className="text-left">
              <th>Scope</th>
              <th>Category</th>
              <th>Frequency</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Note</th>
              <th className="text-right">{loading ? 'Loading…' : `${filtered.length} items`}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <BudgetRow
                key={r.id}
                row={r}
                cats={cats}
                mode={mode}
                canEdit={mode === 'my' ? true : (isGroupMember || isAdmin)}
                onSave={saveRow}
                onDelete={delRow}
              />
            ))}
            {!filtered.length && !loading && (
              <tr><td colSpan="7" className="py-6 text-center text-slate-500">No budgets.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BudgetRow({ row, cats, mode, canEdit, onSave, onDelete }) {
  const [r, setR] = useState(row);
  useEffect(()=>setR(row),[row]);

  return (
    <tr>
      <td>
        <select
          className="select"
          value={r.all_categories ? 'all' : 'category'}
          onChange={e=>{
            const scope = e.target.value;
            setR(prev => ({
              ...prev,
              all_categories: scope === 'all',
              category_id: scope === 'all' ? null : prev.category_id
            }));
          }}
          disabled={!canEdit}
        >
          <option value="category">Category</option>
          <option value="all">All</option>
        </select>
      </td>
      <td>
        <select
          className="select"
          value={r.category_id || ''}
          onChange={e=>setR(prev=>({ ...prev, category_id: e.target.value || null }))}
          disabled={r.all_categories || !canEdit}
        >
          <option value="">(select)</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td>
        <select
          className="select"
          value={r.frequency}
          onChange={e=>setR(prev=>({ ...prev, frequency: e.target.value }))}
          disabled={!canEdit}
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </td>
      <td>
        <input
          className="input tabular-nums"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={r.amount}
          onChange={e=>setR(prev=>({ ...prev, amount: e.target.value }))}
          disabled={!canEdit}
        />
      </td>
      <td>
        <input
          className="input"
          value={r.currency}
          onChange={e=>setR(prev=>({ ...prev, currency: e.target.value.toUpperCase().slice(0,3) }))}
          disabled={!canEdit}
        />
      </td>
      <td>
        <input
          className="input"
          value={r.note || ''}
          onChange={e=>setR(prev=>({ ...prev, note: e.target.value }))}
          disabled={!canEdit}
        />
      </td>
      <td className="text-right">
        <div className="inline-flex gap-2">
          <button className="btn" onClick={()=>onSave(r)} disabled={!canEdit}>Save</button>
          <button className="btn-danger" onClick={()=>onDelete(r.id)}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
