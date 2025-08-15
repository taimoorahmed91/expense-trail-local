import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

const PAGE_SIZE = 10;

export default function ViewExpenses() {
  const { mode } = useViewMode();
  return mode === 'my' ? <MyExpenses /> : <GroupExpensesReadOnly />;
}

/* ===== MY VIEW (CRUD + search + pagination + counters) ===== */
function MyExpenses() {
  const [user, setUser] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cur, setCur] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      const { data: cats } = await supabase.from('category').select('id,name').eq('is_active', true).order('name');
      setCats(cats || []);
    })();
  }, []);

  useEffect(() => { if (user?.id) load(); }, [user, page, q, cat, cur, from, to]);

  async function load() {
    const fromIdx = page * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1; // inclusive
    let query = supabase.from('expense')
      .select('id, amount, currency, spent_at_utc, note, category:category_id(name)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('spent_at_utc', { ascending: false })
      .range(fromIdx, toIdx);

    if (q) query = query.ilike('note', `%${q}%`);
    if (cat) query = query.eq('category_id', cat);
    if (cur) query = query.eq('currency', cur.toUpperCase());
    if (from) query = query.gte('spent_at_utc', new Date(from).toISOString());
    if (to)   query = query.lte('spent_at_utc', new Date(to).toISOString());

    const { data, count } = await query;
    setRows(data || []);
    setTotal(count ?? 0);
  }

  async function del(id) {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('expense').delete().eq('id', id);
    if (!error) {
      // reload; if page is now out-of-range, step back
      const newTotal = Math.max(0, total - 1);
      const maxPage = Math.max(0, Math.ceil(newTotal / PAGE_SIZE) - 1);
      if (page > maxPage) setPage(maxPage);
      else load();
      setTotal(newTotal);
    }
  }

  const start = total ? page * PAGE_SIZE + 1 : 0;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="grid gap-4">
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">View Expenses (My)</h3>
        <div className="grid gap-2 md:grid-cols-6">
          <input className="input md:col-span-2" placeholder="Search description…" value={q}
                 onChange={e=>{setPage(0); setQ(e.target.value);}} />
          <select className="select md:col-span-2" value={cat} onChange={e=>{setPage(0); setCat(e.target.value);}}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input md:col-span-1" placeholder="CUR"
                 value={cur} onChange={e=>{setPage(0); setCur(e.target.value);}} />
          <div className="md:col-span-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">From
              <input className="input mt-1" type="datetime-local" aria-label="From" value={from}
                     onChange={e=>{setPage(0); setFrom(e.target.value);}} />
            </label>
            <label className="text-xs text-slate-500">To
              <input className="input mt-1" type="datetime-local" aria-label="To" value={to}
                     onChange={e=>{setPage(0); setTo(e.target.value);}} />
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr className="text-left">
              <th>Description</th><th className="text-right">Amount</th><th>Currency</th>
              <th>Category</th><th>Date</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="max-w-[24rem] truncate">{r.note || ''}</td>
                <td className="text-right">{Number(r.amount).toFixed(2)}</td>
                <td>{r.currency}</td>
                <td className="capitalize">{r.category?.name || ''}</td>
                <td>{new Date(r.spent_at_utc).toLocaleString()}</td>
                <td className="text-right">
                  <div className="inline-flex gap-2">
                    <button title="Edit" className="icon-btn" onClick={() => navigate(`/me/edit/${r.id}`)}>
                      <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21l3-.6L19.4 6.99a2.12 2.12 0 0 0-3-3L3 17.4V21z"></path><path d="M14 4l6 6"></path>
                      </svg>
                    </button>
                    <button title="Delete" className="icon-btn icon-btn--danger" onClick={() => del(r.id)}>
                      <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18"></path><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"></path>
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6" className="py-4 text-slate-500">No results.</td></tr>}
          </tbody>
        </table>

        {/* Counters + pager */}
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <div>{`Rows ${start}–${end} of ${total} • Page ${total ? page + 1 : 0}`}</div>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button>
            <button className="btn-ghost" disabled={(page+1)*PAGE_SIZE >= total} onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== GROUP VIEW (read-only search over aggregates) ===== */
function GroupExpensesReadOnly() {
  const [groups, setGroups] = useState([]);
  const [gid, setGid] = useState('');
  const [q, setQ] = useState(''); // filter by category name (client-side)
  const [totals, setTotals] = useState([]);
  const [byCat, setByCat] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('group').select('id,name');
      const sorted = (data || []).slice().sort((a,b)=>a.name.localeCompare(b.name, undefined, {sensitivity:'base'}));
      setGroups(sorted);
      setGid(sorted[0]?.id || '');
    })();
  }, []);

  useEffect(() => {
    if (!gid) return;
    (async () => {
      const { data: t } = await supabase.rpc('group_aggregate_totals', { g: gid });
      setTotals(t || []);
      const { data: c } = await supabase.rpc('group_aggregate_by_category', { g: gid });
      setByCat(c || []);
    })();
  }, [gid]);

  const filteredByCat = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return byCat;
    return byCat.filter(r => (r.category || '').toLowerCase().includes(needle));
  }, [byCat, q]);

  return (
    <div className="grid gap-4">
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">View Expenses (Group — read-only)</h3>
        <div className="grid gap-2 md:grid-cols-6">
          <select className="select md:col-span-2" value={gid} onChange={e=>setGid(e.target.value)}>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input className="input md:col-span-2" placeholder="Search category…" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {totals.map((r,i)=>(
          <div key={i} className="card">
            <div className="text-sm text-slate-500">Currency</div>
            <div className="text-2xl font-semibold">{r.currency}</div>
            <div className="mt-2 text-sm">Total</div>
            <div className="text-xl">{Number(r.total).toFixed(2)}</div>
            <div className="mt-2 text-sm">Count</div>
            <div className="text-xl">{r.cnt}</div>
          </div>
        ))}
        {!totals.length && <div className="card text-slate-500">No totals.</div>}
      </div>

      <div className="card">
        <h4 className="text-lg font-semibold mb-3">By Category</h4>
        <table className="table">
          <thead>
            <tr className="text-left"><th>Category</th><th>Currency</th><th>Total</th><th>Count</th></tr>
          </thead>
          <tbody>
            {filteredByCat.map((r,i)=>(
              <tr key={i}>
                <td className="capitalize">{r.category}</td>
                <td>{r.currency}</td>
                <td>{Number(r.total).toFixed(2)}</td>
                <td>{r.cnt}</td>
              </tr>
            ))}
            {!filteredByCat.length && <tr><td colSpan="4" className="py-4 text-slate-500">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
