// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

import 'chart.js/auto';
import { Doughnut } from 'react-chartjs-2';

const RENTAL_ID = '26963812-8115-4d25-b820-306327d5cce5';
const BILLS_ID  = '925ff711-2efb-412d-a4e2-c591785bcbb5';
const CURRENCY  = 'PLN';

export default function Dashboard() {
  const { mode } = useViewMode();
  const [ready, setReady] = useState(false);
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null);

  const [cards, setCards] = useState({
    thisMonthTotal: 0,
    thisMonthCount: 0,
    allTimeTotal: 0,
    nonRentalMonth: 0,
    avgAllTime: 0,
    topCategory: null,
  });

  const [pieToday, setPieToday] = useState(null);
  const [pieWeek, setPieWeek]   = useState(null);
  const [pieMonth, setPieMonth] = useState(null);

  useEffect(() => {
    (async () => {
      if (mode === 'group') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let list = [];
        const { data: mems } = await supabase
          .from('group_member')
          .select('group_id')
          .eq('user_id', user.id);
        const ids = (mems || []).map(m => m.group_id);
        const { data } = ids.length
          ? await supabase.from('group').select('id,name').in('id', ids).order('name')
          : { data: [] };
        list = data || [];
        setGroups(list);

        const sid = localStorage.getItem('active_group_id');
        const snm = localStorage.getItem('active_group_name');
        let g = null;
        if (sid && list.some(x => x.id === sid)) {
          g = { id: sid, name: snm || (list.find(x => x.id === sid)?.name || '') };
        } else if (list.length) {
          g = list[0];
          localStorage.setItem('active_group_id', g.id);
          localStorage.setItem('active_group_name', g.name);
        }
        setGroup(g);
        if (g) await loadData(mode, g);
      } else {
        setGroups([]);
        setGroup(null);
        await loadData(mode);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function pickGroup(id) {
    const g = groups.find(x => x.id === id) || null;
    if (g) {
      localStorage.setItem('active_group_id', g.id);
      localStorage.setItem('active_group_name', g.name);
    }
    setGroup(g);
    await loadData('group', g);
  }

  async function loadData(view, g) {
    let cancelled = false;

    // LOCAL (Warsaw/browser) day bounds
    const now         = new Date();
    const todayStart  = new Date(now);          todayStart.setHours(0, 0, 0, 0);
    const endOfToday  = new Date(todayStart);   endOfToday.setDate(endOfToday.getDate() + 1);

    const weekStart   = new Date(todayStart);   weekStart.setDate(weekStart.getDate() - 6);
    const monthStart  = new Date(todayStart);   monthStart.setDate(1);
    // If you ever want month-to-date cards: use endOfToday; leaving cards minimal below.

    let all = [];

    if (view === 'my') {
      const { data: rows, error } = await supabase
        .from('expense')
        .select('amount, currency, category:category_id(name,color), spent_at_utc')
        .order('spent_at_utc', { ascending: true });
      if (error) { console.error(error); return; }
      all = (rows || []).filter(r => r.currency === CURRENCY);
    } else if (view === 'group' && g?.id) {
      const { data: rows, error } = await supabase
        .rpc('group_aggregate_by_category', { g: g.id });
      if (error) { console.error(error); return; }
      all = (rows || [])
        .filter(r => r.currency === CURRENCY)
        .map(r => ({
          amount: r.total,
          currency: r.currency,
          category: { name: r.category, color: r.color || null },
          spent_at_utc: r.first_date || new Date().toISOString()
        }));
    }

    // ===== Cards (kept as-is, except using local monthStart and endOfToday for to-date) =====
    const allTimeTotal = all.reduce((s, r) => s + Number(r.amount), 0);
    const thisMonth = all.filter(r => {
      const t = new Date(r.spent_at_utc);
      return t >= monthStart && t < endOfToday; // month to-date (local)
    });
    const thisMonthTotal = thisMonth.reduce((s, r) => s + Number(r.amount), 0);
    const thisMonthCount = thisMonth.length;
    const nonRentalMonth = thisMonth
      .filter(r => r.category?.name !== 'Rental' && r.category?.name !== 'Bills & Utilities')
      .reduce((s, r) => s + Number(r.amount), 0);
    const avgAllTime = all.length ? allTimeTotal / all.length : 0;

    let byCatAll = new Map();
    for (const r of all) {
      byCatAll.set(r.category?.name || '(uncategorized)',
        (byCatAll.get(r.category?.name || '(uncategorized)') || 0) + Number(r.amount));
    }
    let topCategory = null, max = -1;
    for (const [cat, sum] of byCatAll.entries()) if (sum > max) { max = sum; topCategory = cat; }

    if (!cancelled) {
      setCards({ thisMonthTotal, thisMonthCount, allTimeTotal, nonRentalMonth, avgAllTime, topCategory });
    }

    // ===== Pie Charts (bounded; exclusive end) =====
    const buildPie = (start, end) => {
      const map = new Map();
      all.filter(r => {
        const t = new Date(r.spent_at_utc);
        return t >= start && t < end;
      }).forEach(r => {
        const cat = r.category?.name || '(uncategorized)';
        map.set(cat, (map.get(cat) || 0) + Number(r.amount));
      });
      const labels = Array.from(map.keys());
      const values = Array.from(map.values());
      const total  = values.reduce((a, b) => a + b, 0);
      const labelsWithPercent = labels.map((label, i) => {
        const pct = total ? ((values[i] / total) * 100).toFixed(1) : 0;
        return `${label} ${pct}%`;
      });
      const colors = labels.map((_, i) => darkPalette[i % darkPalette.length]);
      return { labels: labelsWithPercent, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] };
    };

    setPieToday(buildPie(todayStart, endOfToday));
    setPieWeek(buildPie(weekStart, endOfToday));   // last 7 days → today (local)
    setPieMonth(buildPie(monthStart, endOfToday)); // month to-date (local)

    if (!cancelled) setReady(true);
  }

  if (!ready) return <div className="opacity-70">Loading…</div>;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {mode === 'group' && (
          <div className="flex items-center gap-3">
            <span className="badge whitespace-nowrap">Group: {group?.name || '—'}</span>
            <select className="select w-56" value={group?.id || ''} onChange={e=>pickGroup(e.target.value)}>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <Card title="This Month" hint={`${cards.thisMonthCount} transactions`} value={cards.thisMonthTotal} accent="border-amber-500/40" />
        <Card title="Total Expenses" hint="All time total" value={cards.allTimeTotal} />
        <Card title="Non Rental Expenses" hint="This month excl. rent/bills" value={cards.nonRentalMonth} accent="border-emerald-500/40" />
        <Card title="Average Expense" hint="Per transaction" value={cards.avgAllTime} />
        <Card title="Top Category" hint="Most spent category" valueLabel={cards.topCategory ?? '—'} />
      </div>

      {/* Pie Charts */}
      <div className="grid gap-6 md:grid-cols-3">
        <ChartCard title="Today's Expenses"    chart={<Doughnut data={pieToday} options={pieOpts} />} />
        <ChartCard title="This Week's Expenses" chart={<Doughnut data={pieWeek} options={pieOpts} />} />
        <ChartCard title="This Month's Expenses" chart={<Doughnut data={pieMonth} options={pieOpts} />} />
      </div>
    </div>
  );
}

function Card({ title, hint, value, valueLabel, accent }) {
  return (
    <div className={`rounded-2xl border bg-slate-900/40 p-5 ${accent ?? 'border-slate-700/60'}`}>
      <div className="text-sm text-slate-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{valueLabel ?? fmt(value)}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function ChartCard({ title, chart }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5 h-80 flex flex-col">
      <div className="text-sm text-slate-400 mb-4">{title}</div>
      <div className="flex-1">{chart}</div>
    </div>
  );
}

function fmt(n) {
  try { return `${Number(n).toFixed(2)} ${CURRENCY}`; } catch { return `0.00 ${CURRENCY}`; }
}

const darkPalette = [
  '#22d3ee', '#f43f5e', '#10b981', '#f59e0b', '#6366f1',
  '#84cc16', '#eab308', '#a78bfa', '#06b6d4', '#ef4444'
];

const pieOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'right', labels: { color: '#94a3b8', usePointStyle: true, padding: 15 } } },
  cutout: '70%',
};
