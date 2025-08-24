import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

const PAGE_SIZE = 10;
const plDT = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

export default function ViewExpenses() {
  const { mode } = useViewMode();
  return mode === 'my' ? <MyExpenses /> : <GroupExpensesReadOnly />;
}

/* ---------- helpers ---------- */
function endOfLocalDayToUtcISO(input /* 'YYYY-MM-DDThh:mm' */) {
  if (!input) return null;
  const d = new Date(input);
  const noTimePicked = /T00:00$/.test(input) && d.getHours() === 0 && d.getMinutes() === 0;
  if (noTimePicked) d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/* ---------- MY VIEW (list + filters + pagination) ---------- */
function MyExpenses() {
  const [user, setUser] = useState(null);
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cur, setCur] = useState('');
  const [from, setFrom] = useState(''); // datetime-local string
  const [to, setTo] = useState('');     // datetime-local string
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUser(u?.user || null);
      const { data: _cats } = await supabase
        .from('category')
        .select('id,name')
        .eq('is_active', true)
        .order('name');
      setCats(_cats || []);
    })();
  }, []);

  useEffect(() => { if (user?.id) load(); }, [user, page, q, cat, cur, from, to]);

  async function load() {
    const fromIdx = page * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1; // inclusive for .range()

    let query = supabase
      .from('expense')
      .select('id, amount, currency, spent_at_utc, note, category:category_id(name)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('spent_at_utc', { ascending: false })
      .range(fromIdx, toIdx);

    if (q)   query = query.ilike('note', `%${q}%`);
    if (cat) query = query.eq('category_id', cat);
    if (cur) query = query.eq('currency', cur.toUpperCase());
    if (from) query = query.gte('spent_at_utc', new Date(from).toISOString());
    if (to)   query = query.lt('spent_at_utc', endOfLocalDayToUtcISO(to));

    const { data, count } = await query;
    setRows(data || []);
    setTotal(count ?? 0);
  }

  async function del(id) {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('expense').delete().eq('id', id);
    if (!error) {
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
          <input
            className="input md:col-span-2"
            placeholder="Search description…"
            value={q}
            onChange={e => { setPage(0); setQ(e.target.value); }}
          />
          <select
            className="select md:col-span-2"
            value={cat}
            onChange={e => { setPage(0); setCat(e.target.value); }}
          >
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            className="input md:col-span-1"
            placeholder="CUR"
            value={cur}
            onChange={e => { setPage(0); setCur(e.target.value); }}
          />
          <div className="md:col-span-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">From
              <input
                className="input mt-1"
                type="datetime-local"
                aria-label="From"
                value={from}
                onChange={e => { setPage(0); setFrom(e.target.value); }}
              />
            </label>
            <label className="text-xs text-slate-500">To
              <input
                className="input mt-1"
                type="datetime-local"
                aria-label="To"
                value={to}
                onChange={e => { setPage(0); setTo(e.target.value); }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr className="text-left">
              <th>Description</th>
              <th className="text-right">Amount</th>
              <th>Currency</th>
              <th>Category</th>
              <th>Date</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="max-w-[24rem] truncate">{r.note || ''}</td>
                <td className="text-right">{Number(r.amount).toFixed(2)}</td>
                <td>{r.currency}</td>
                <td className="capitalize">{r.category?.name || ''}</td>
                <td>{r.spent_at_utc ? plDT.format(new Date(r.spent_at_utc)) : ''}</td>
                <td className="text-right">
                  <div className="inline-flex gap-2">
                    <button className="btn-ghost" title="Edit" onClick={() => navigate(`/me/edit/${r.id}`)}>
                      Edit
                    </button>
                    <button className="btn-ghost text-red-600" title="Delete" onClick={() => del(r.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan="6" className="py-4 text-slate-500">No results.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <div>{`Rows ${start}–${end} of ${total} • Page ${total ? page + 1 : 0}`}</div>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-ghost" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- GROUP VIEW (read-only summary; untouched) ---------- */
function GroupExpensesReadOnly() {
  const [user, setUser] = useState(null);
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [cat, setCat] = useState('');
  const [cur, setCur] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUser(u?.user || null);
      const { data: _cats } = await supabase
        .from('category')
        .select('id,name')
        .eq('is_active', true)
        .order('name');
      setCats(_cats || []);
    })();
  }, []);

  useEffect(() => { if (user?.id) load(); }, [user, cat, cur, from, to]);

  async function load() {
    let query = supabase
      .from('expense')
      .select('id, amount, currency, spent_at_utc, category:category_id(name)')
      .eq('user_id', user.id)
      .order('spent_at_utc', { ascending: false });

    if (cat) query = query.eq('category_id', cat);
    if (cur) query = query.eq('currency', cur.toUpperCase());
    if (from) query = query.gte('spent_at_utc', new Date(from).toISOString());
    if (to)   query = query.lt('spent_at_utc', endOfLocalDayToUtcISO(to));

    const { data } = await query;
    setRows(data || []);
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const catName = r.category?.name || 'uncategorized';
      const key = `${catName}||${r.currency}`;
      const cur = map.get(key) || { category: catName, currency: r.currency, total: 0, cnt: 0 };
      cur.total += Number(r.amount) || 0;
      cur.cnt += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const filteredByCat = grouped.filter(g => (cat ? cats.find(c => c.id === cat)?.name === g.category : true));

  return (
    <div className="grid gap-4">
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">Group Summary (Read-only)</h3>
        <div className="grid gap-2 md:grid-cols-5">
          <select className="select md:col-span-2" value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" placeholder="CUR" value={cur} onChange={e => setCur(e.target.value)} />
          <label className="text-xs text-slate-500">From
            <input className="input mt-1" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">To
            <input className="input mt-1" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr className="text-left">
              <th>Category</th>
              <th>Currency</th>
              <th>Total</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {filteredByCat.map((r, i) => (
              <tr key={i}>
                <td className="capitalize">{r.category}</td>
                <td>{r.currency}</td>
                <td>{Number(r.total).toFixed(2)}</td>
                <td>{r.cnt}</td>
              </tr>
            ))}
            {!filteredByCat.length && (
              <tr>
                <td colSpan="4" className="py-4 text-slate-500">No data</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
