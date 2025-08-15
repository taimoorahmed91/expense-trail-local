import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MyView() {
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      await loadRows(user?.id);
    })();
  }, []);

  async function loadRows(uid) {
    if (!uid) return;
    const { data } = await supabase
      .from('expense')
      .select('amount, currency')
      .eq('user_id', uid);
    setRows(data || []);
  }

  const totalsByCur = useMemo(() => {
    const res = {};
    for (const r of rows) res[r.currency] = (res[r.currency] || 0) + Number(r.amount || 0);
    return res;
  }, [rows]);

  return (
    <div className="grid gap-6">
      <div className="card">
        <h3 className="text-lg font-semibold">My Expenses</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Dashboard summary. Use “+ Add Expense” in the sidebar to add entries.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.keys(totalsByCur).length
          ? Object.entries(totalsByCur).map(([cur, total]) => (
              <div key={cur} className="card">
                <div className="text-sm text-slate-600 dark:text-slate-400">Total ({cur})</div>
                <div className="text-2xl font-semibold">{total.toFixed(2)}</div>
                <div className="mt-1 text-xs text-slate-500">{rows.length} entries</div>
              </div>
            ))
          : <div className="card text-slate-500">No totals yet.</div>}
      </div>
    </div>
  );
}
