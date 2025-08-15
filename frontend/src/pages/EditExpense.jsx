import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

export default function EditExpense() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({
    amount: '', currency: 'PLN', category_id: '', note: '', spent_at_utc: new Date().toISOString().slice(0,16)
  });
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();
  const { setMode } = useViewMode();

  useEffect(() => {
    setMode('my');
    (async () => {
      const [{ data: userRes }, { data: catsRes }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('category').select('id,name,priority').eq('is_active', true).order('priority', { ascending: true })
      ]);
      setUser(userRes.user);
      setCats(catsRes || []);

      // load existing expense
      const { data, error } = await supabase
        .from('expense')
        .select('id, amount, currency, category_id, note, spent_at_utc')
        .eq('id', id)
        .single();
      if (error || !data) { setMsg('Unable to load expense'); return; }
      setForm({
        amount: String(data.amount),
        currency: data.currency || 'PLN',
        category_id: data.category_id || '',
        note: data.note || '',
        spent_at_utc: new Date(data.spent_at_utc).toISOString().slice(0,16)
      });
    })();
  }, [id, setMode]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    if (!form.category_id) { setMsg('Category is required.'); return; }
    const payload = {
      amount: Number(form.amount),
      currency: form.currency,
      category_id: form.category_id,
      note: form.note || null,
      spent_at_utc: new Date(form.spent_at_utc)
    };
    const { error } = await supabase.from('expense').update(payload).eq('id', id);
    if (error) { setMsg(error.message); return; }
    navigate('/me/add'); // back to Recent list
  }

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Expense</h3>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={()=>navigate('/me/add')}>Cancel</button>
            <button className="btn" onClick={save}>Save</button>
          </div>
        </div>

        <form onSubmit={save} className="grid gap-3 md:grid-cols-6">
          <input className="input md:col-span-1" type="number" step="0.01" placeholder="Amount"
                 value={form.amount} onChange={e=>setForm(f=>({...f, amount:e.target.value}))} required />
          <input className="input md:col-span-1" placeholder="CUR"
                 value={form.currency} onChange={e=>setForm(f=>({...f, currency:e.target.value.toUpperCase().slice(0,3)}))} required />
          <select className="select md:col-span-2" value={form.category_id}
                  onChange={e=>setForm(f=>({...f, category_id:e.target.value}))} required>
            <option value="" disabled>(select category)</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input md:col-span-2" type="datetime-local"
                 value={form.spent_at_utc} onChange={e=>setForm(f=>({...f, spent_at_utc:e.target.value}))} required />
          <input className="input md:col-span-6" placeholder="Description"
                 value={form.note} onChange={e=>setForm(f=>({...f, note:e.target.value}))} />
          <button className="btn md:col-span-1" type="submit">Save</button>
        </form>

        {msg && <div className="mt-3" style={{color: '#ef4444'}}>{msg}</div>}
      </div>
    </div>
  );
}
