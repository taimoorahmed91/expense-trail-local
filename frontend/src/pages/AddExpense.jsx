import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

const PAGE_SIZE = 10;

export default function AddExpense() {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState(''); // full_name -> username
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    note: '',
    amount: '',
    currency: 'PLN',
    category_id: '',
    spent_at_utc: new Date().toISOString().slice(0, 16)
  });

  const navigate = useNavigate();
  const { setMode } = useViewMode();

  useEffect(() => {
    setMode('my');
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user?.id) {
        const { data: prof } = await supabase
          .from('profile')
          .select('full_name, username')
          .eq('user_id', user.id)
          .single();
        setDisplayName(prof?.full_name || prof?.username || '');
      }

      const { data: cats } = await supabase
        .from('category')
        .select('id,name,priority')
        .eq('is_active', true)
        .order('priority', { ascending: true });
      setCats(cats || []);
    })();
  }, [setMode]);

  useEffect(() => { if (user?.id) load(); }, [user, page]);

  async function load() {
    if (!user) return;
    const fromIdx = page * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1; // inclusive
    const { data, count } = await supabase
      .from('expense')
      .select('id, user_id, amount, currency, spent_at_utc, note, category:category_id(name)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('spent_at_utc', { ascending: false })
      .range(fromIdx, toIdx);
    setRows(data || []);
    setTotal(count ?? 0);
  }

  async function save(e) {
    e?.preventDefault();
    setMsg('');
    if (!user) return;
    if (!form.category_id) { setMsg('Category is required.'); return; }

    const payload = {
      user_id: user.id,
      note: form.note || null,
      amount: Number(form.amount),
      currency: form.currency,
      category_id: form.category_id,
      spent_at_utc: new Date(form.spent_at_utc)
    };

    const { error } = await supabase.from('expense').insert(payload);
    if (error) { setMsg(error.message); return; }

    setMsg('Saved');
    setForm(f => ({
      ...f,
      note: '',
      amount: '',
      currency: 'PLN',
      category_id: '',
      spent_at_utc: new Date().toISOString().slice(0, 16)
    }));
    setPage(0); // go back to first page
    await load();
  }

  async function del(id) {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('expense').delete().eq('id', id);
    if (!error) {
      const newTotal = Math.max(0, total - 1);
      const maxPage = Math.max(0, Math.ceil(newTotal / PAGE_SIZE) - 1);
      if (page > maxPage) setPage(maxPage);
      else await load();
      setTotal(newTotal);
    }
  }

  const start = total ? page * PAGE_SIZE + 1 : 0;
  const end   = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Add Expense</h3>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => navigate('/me')}>Back to My View</button>
            <button className="btn" onClick={save}>Save</button>
          </div>
        </div>

        {/* Form: Description → Amount → Currency → Category → Date */}
        <form onSubmit={save} className="grid gap-3 md:grid-cols-6">
          <input
            className="input md:col-span-6"
            placeholder="Description"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          />
          <input
            className="input md:col-span-2"
            type="number"
            step="0.01"
            placeholder="Amount"
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            required
          />
          <input
            className="input md:col-span-1"
            placeholder="CUR"
            value={form.currency}
            onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase().slice(0, 3) }))}
            required
          />
          <select
            className="select md:col-span-2"
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
            required
          >
            <option value="" disabled>(select category)</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            className="input md:col-span-1"
            type="datetime-local"
            value={form.spent_at_utc}
            onChange={e => setForm(f => ({ ...f, spent_at_utc: e.target.value }))}
            required
          />
          <button className="btn md:col-span-1" type="submit">Save</button>
        </form>

        {msg && <div className="mt-3" style={{ color: msg === 'Saved' ? '#16a34a' : '#ef4444' }}>{msg}</div>}
      </div>

      {/* Recent: 10 per page + counters */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">Recent</h3>
        <table className="table">
          <thead>
            <tr className="text-left">
              <th>Description</th>
              <th className="text-right">Amount</th>
              <th>Currency</th>
              <th>Category</th>
              <th>Date</th>
              <th>Added by</th>
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
                <td>{new Date(r.spent_at_utc).toLocaleString()}</td>
                <td>{displayName}</td>
                <td className="text-right">
                  <div className="inline-flex gap-2">
                    {/* Edit (pencil) */}
                    <button
                      title="Edit"
                      className="icon-btn"
                      onClick={() => navigate(`/me/edit/${r.id}`)}
                    >
                      <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21l3-.6L19.4 6.99a2.12 2.12 0 0 0-3-3L3 17.4V21z"></path>
                        <path d="M14 4l6 6"></path>
                      </svg>
                    </button>

                    {/* Delete (trash) */}
                    <button
                      title="Delete"
                      className="icon-btn icon-btn--danger"
                      onClick={() => del(r.id)}
                    >
                      <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"></path>
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                        <path d="M10 11v6"></path>
                        <path d="M14 11v6"></path>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan="7" className="py-4 text-slate-500">No expenses yet.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Counters + pager */}
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <div>{`Rows ${start}–${end} of ${total} • Page ${total ? page + 1 : 0}`}</div>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button>
            <button className="btn-ghost" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
