// src/pages/Analysis.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useViewMode } from '../ctx/viewMode';

// Chart.js
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';

const CURRENCY = 'PLN';

export default function Analysis() {
  const { mode } = useViewMode(); // 'my' | 'group'

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null); // {id,name}

  const [catColors, setCatColors] = useState(new Map());
  const [series, setSeries] = useState({}); // { [cat]: { color, daily:[{x:Date,y}], weekly:[...], monthly:[...] } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u || null);

      let admin = false;
      if (u?.id) {
        const { data: prof } = await supabase
          .from('profile').select('is_superadmin').eq('user_id', u.id).maybeSingle();
        admin = !!prof?.is_superadmin;
      }
      setIsAdmin(admin);

      const { data: cats } = await supabase
        .from('category').select('name,color,is_active').eq('is_active', true).order('name');
      const cmap = new Map();
      (cats || []).forEach(c => cmap.set(c.name, c.color || ''));
      setCatColors(cmap);

      let g = null;
      if (mode === 'group') {
        let list = [];
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

        const sid = localStorage.getItem('active_group_id');
        const snm = localStorage.getItem('active_group_name');
        if (sid && list.some(x => x.id === sid)) {
          g = { id: sid, name: snm || (list.find(x => x.id === sid)?.name || '') };
        } else if (list.length) {
          g = list[0];
          localStorage.setItem('active_group_id', g.id);
          localStorage.setItem('active_group_name', g.name);
        }
        setGroup(g);
      } else {
        setGroups([]);
        setGroup(null);
      }

      await loadData(mode, u, g);
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
    await loadData('group', user, g);
  }

  async function loadData(view, u, g) {
    setLoading(true);
    try {
      const now = new Date();
      const start30  = addDays(now, -29);
      const start12w = addDays(startOfDay(now), -7 * 11);
      const start6m  = addMonths(startOfMonth(now), -5);

      const dailyKeys   = buildDailyKeys(start30, now);
      const weeklyKeys  = buildWeeklyKeys(start12w, now);
      const monthlyKeys = buildMonthlyKeys(start6m, now);

      const perCat = {};
      const ensure = (name) => {
        if (!perCat[name]) {
          perCat[name] = {
            color: catColors.get(name) || fallbackColor(name),
            daily:   Object.fromEntries(dailyKeys.map(k => [k, 0])),
            weekly:  Object.fromEntries(weeklyKeys.map(k => [k, 0])),
            monthly: Object.fromEntries(monthlyKeys.map(k => [k, 0])),
          };
        }
        return perCat[name];
      };

      if (view === 'my') {
        const { data: rows } = await supabase
          .from('expense')
          .select('amount, currency, spent_at_utc, category:category_id(name)')
          .gte('spent_at_utc', start6m.toISOString())
          .order('spent_at_utc', { ascending: true });

        (rows || [])
          .filter(r => r.currency === CURRENCY)
          .forEach(r => {
            const name = r.category?.name || '(uncategorized)';
            const b = ensure(name);
            const t = new Date(r.spent_at_utc);
            const amt = Number(r.amount) || 0;
            if (t >= start30)  b.daily[toISODate(t)]   += amt;
            if (t >= start12w) b.weekly[toISODate(startOfWeek(t))] += amt;
            if (t >= start6m)  b.monthly[toISODate(startOfMonth(t))] += amt;
          });

      } else if (view === 'group' && g?.id) {
        const [dRes, wRes, mRes] = await Promise.all([
          supabase.rpc('group_timeseries', { g: g.id, start_ts: start30.toISOString(),  bucket: 'day' }),
          supabase.rpc('group_timeseries', { g: g.id, start_ts: start12w.toISOString(), bucket: 'week' }),
          supabase.rpc('group_timeseries', { g: g.id, start_ts: start6m.toISOString(),  bucket: 'month' }),
        ]);
        const daily   = (dRes.data || []).filter(x => x.currency === CURRENCY);
        const weekly  = (wRes.data || []).filter(x => x.currency === CURRENCY);
        const monthly = (mRes.data || []).filter(x => x.currency === CURRENCY);

        for (const r of daily) {
          const name = r.category || '(uncategorized)';
          const b = ensure(name);
          const k = toISODate(new Date(r.bucket_start));
          if (k in b.daily) b.daily[k] += Number(r.total) || 0;
        }
        for (const r of weekly) {
          const name = r.category || '(uncategorized)';
          const b = ensure(name);
          const k = toISODate(startOfWeek(new Date(r.bucket_start)));
          if (k in b.weekly) b.weekly[k] += Number(r.total) || 0;
        }
        for (const r of monthly) {
          const name = r.category || '(uncategorized)';
          const b = ensure(name);
          const k = toISODate(startOfMonth(new Date(r.bucket_start)));
          if (k in b.monthly) b.monthly[k] += Number(r.total) || 0;
        }
      }

      const packed = {};
      Object.entries(perCat).forEach(([name, s]) => {
        packed[name] = {
          color: s.color,
          daily:   toPoints(s.daily),    // [{x:Date,y}]
          weekly:  toPoints(s.weekly),
          monthly: toPoints(s.monthly),
        };
      });
      setSeries(packed);
    } finally {
      setLoading(false);
    }
  }

  const catsToShow = useMemo(() => {
    return Object.keys(series).filter(cat => {
      const s = series[cat];
      return (s?.daily?.some(p=>p.y>0) || s?.weekly?.some(p=>p.y>0) || s?.monthly?.some(p=>p.y>0));
    }).sort();
  }, [series]);

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Analysis</h1>
        {mode === 'group' && (
          <div className="flex items-center gap-3">
            <span className="badge whitespace-nowrap">Group: {group?.name || '—'}</span>
            <select className="select w-56" value={group?.id || ''} onChange={e=>pickGroup(e.target.value)}>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading && <div className="opacity-70">Loading…</div>}
      {!loading && !catsToShow.length && <div className="opacity-70">No data in the selected windows.</div>}

      {catsToShow.map(cat => (
        <div key={cat} className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <h2 className="md:col-span-2 xl:col-span-3 text-lg font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: series[cat].color || '#22d3ee' }} />
            {cat}
          </h2>

          <ChartCard title="Daily (30 days)"   color={series[cat].color} points={series[cat].daily} />
          <ChartCard title="Weekly (12 weeks)" color={series[cat].color} points={series[cat].weekly} />
          <ChartCard title="Monthly (6 months)" color={series[cat].color} points={series[cat].monthly} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Chart card (Chart.js) ---------- */
function ChartCard({ title, points, color }) {
  const total = points.reduce((s,p)=>s+(p.y||0),0);
  const data = {
    datasets: [{
      label: title,
      data: points, // [{x:Date, y:number}]
      borderColor: color || '#22d3ee',
      backgroundColor: color || '#22d3ee',
      tension: 0.25,
      pointRadius: 2,
      pointHoverRadius: 3,
    }],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: pickUnit(points) }, // day | week | month
        ticks: { color: '#94a3b8' },
        grid: { color: '#334155' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#94a3b8' },
        grid: { color: '#334155' },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="text-sm text-slate-400 mb-2">{title}</div>
      <div className="h-44">
        <Line data={data} options={options} />
      </div>
      <div className="mt-2 text-right text-sm text-slate-400">Total: {fmt(total)}</div>
    </div>
  );
}

/* ---------- helpers ---------- */
function fmt(n){ return `${Number(n||0).toFixed(2)} ${CURRENCY}`; }
const round2 = n => Math.round(Number(n||0)*100)/100;

function toISODate(d){ const z = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); return z.toISOString().slice(0,10); }
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d){ const x=startOfDay(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; } // Mon
function startOfMonth(d){ const x=startOfDay(d); x.setDate(1); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d,n){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }

function buildDailyKeys(start, end){ const ks=[]; let d=startOfDay(start); const E=startOfDay(end); while (d<=E){ ks.push(toISODate(d)); d=addDays(d,1);} return ks; }
function buildWeeklyKeys(start, end){ const ks=[]; let d=startOfWeek(start); const E=startOfWeek(end); while (d<=E){ ks.push(toISODate(d)); d=addDays(d,7);} return ks; }
function buildMonthlyKeys(start, end){ const ks=[]; let d=startOfMonth(start); const E=startOfMonth(end); while (d<=E){ ks.push(toISODate(d)); d=addMonths(d,1);} return ks; }

function toPoints(mapObj){
  // map 'YYYY-MM-DD' -> number to [{x:Date, y:number}]
  return Object.keys(mapObj).sort().map(k => ({ x: new Date(k+'T00:00:00Z'), y: round2(mapObj[k]) }));
}

function fallbackColor(name){
  const palette = ['#22d3ee','#f43f5e','#10b981','#f59e0b','#6366f1','#84cc16','#eab308','#a78bfa','#06b6d4','#ef4444'];
  let h=0; for (let i=0;i<name.length;i++) h=(h*31 + name.charCodeAt(i))>>>0;
  return palette[h % palette.length];
}

function pickUnit(points){
  // crude but fine: infer unit from span
  if (!points.length) return 'day';
  const spanMs = points[points.length-1].x - points[0].x;
  const weeks = spanMs / (7*24*3600*1000);
  if (weeks > 20) return 'month';
  if (weeks > 3) return 'week';
  return 'day';
}
