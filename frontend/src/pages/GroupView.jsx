import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function GroupView() {
  const [groups, setGroups] = useState([]);
  const [gid, setGid] = useState('');           // will auto-select first A→Z
  const [totals, setTotals] = useState([]);
  const [byCat, setByCat] = useState([]);

  // load groups, pick default = first alphabetically (case-insensitive)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('group').select('id,name');
      if (error) return;
      const sorted = (data || []).slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      setGroups(sorted);
      setGid(prev => prev || (sorted[0]?.id || ''));
    })();
  }, []);

  // load aggregates when gid changes
  useEffect(() => {
    if (!gid) return;
    (async () => {
      const { data: t } = await supabase.rpc('group_aggregate_totals', { g: gid });
      setTotals(t || []);
      const { data: c } = await supabase.rpc('group_aggregate_by_category', { g: gid });
      setByCat(c || []);
    })();
  }, [gid]);

  return (
    <div className="grid gap-6">
      <div className="card flex items-center gap-3">
        <h3 className="text-lg font-semibold">Group Dashboard</h3>
        <select className="select max-w-xs" value={gid} onChange={e=>setGid(e.target.value)}>
          {/* we still render the placeholder for clarity, but gid will be pre-set */}
          <option value="" disabled>Select a group…</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {gid && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {totals.map((r,i)=>(
              <div key={i} className="card">
                <div className="text-sm text-slate-500 dark:text-slate-400">Currency</div>
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
                {byCat.map((r,i)=>(
                  <tr key={i}>
                    <td className="capitalize">{r.category}</td>
                    <td>{r.currency}</td>
                    <td>{Number(r.total).toFixed(2)}</td>
                    <td>{r.cnt}</td>
                  </tr>
                ))}
                {!byCat.length && <tr><td colSpan="4" className="py-4 text-slate-500">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
