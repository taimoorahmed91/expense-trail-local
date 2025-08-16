// src/pages/Audit.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Audit() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: auditsData } = await supabase
        .from('audit_log_ui')
        .select('*')
        .order('performed_at', { ascending: false });

      setAudits(auditsData || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="opacity-70">Loading…</div>;

  return (
    <div className="grid gap-8">
      <h1 className="text-xl font-semibold">Audit Logs</h1>

      {/* CRUD Audit Table */}
      <div>
        <div className="overflow-x-auto rounded-lg border border-slate-700/60">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Category</th>
                <th>Changed Fields</th>
                <th>Old Data</th>
                <th>New Data</th>
                <th>Performed At</th>
              </tr>
            </thead>
            <tbody>
              {audits.length ? (
                audits.map((a) => (
                  <tr key={a.id}>
                    <td>{a.action}</td>
                    <td>{a.user_name ?? a.user_full_name ?? a.username ?? '—'}</td>
                    <td>{a.category_name}</td>
                    <td>{a.changed_fields?.join(', ') || '-'}</td>
                    <td>
                      <pre className="whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(a.old_data, null, 2)}
                      </pre>
                    </td>
                    <td>
                      <pre className="whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(a.new_data, null, 2)}
                      </pre>
                    </td>
                    <td>{new Date(a.performed_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-4">
                    No audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
