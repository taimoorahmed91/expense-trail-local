import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { ViewModeProvider, useViewMode } from './ctx/viewMode';
import { Tags } from 'lucide-react';
import { WalletMinimal } from 'lucide-react';
import { LineChart } from 'lucide-react';
import { ClipboardList } from 'lucide-react';
import {
  LayoutDashboard,
  ReceiptText,
  PlusSquare,
  Eye,
  Users,
  UserCog
} from 'lucide-react';
import './index.css';

export default function App() {
  const loc = useLocation();
  const initial = loc.pathname.startsWith('/group') ? 'group' : 'my';
  return (
    <ViewModeProvider initial={initial}>
      <Shell />
    </ViewModeProvider>
  );
}

function Shell() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [openAdmin, setOpenAdmin] = useState(false);

  const { mode, setMode } = useViewMode();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login'); return; }

      setEmail(session.user.email || '');
      const { data: prof } = await supabase
        .from('profile').select('full_name,username,is_superadmin')
        .eq('user_id', session.user.id).single();
      setDisplayName(prof?.full_name || prof?.username || session.user.email || '');
      setIsAdmin(!!prof?.is_superadmin);

      const { data } = await supabase.rpc('user_can_use_app');
      setAllowed(Boolean(data));
      setReady(true);
    })();
  }, [navigate]);

  useEffect(() => {
    const stored = localStorage.getItem('theme') || 'dark';
    document.documentElement.classList.toggle('dark', stored === 'dark');
    setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    const next = html.classList.contains('dark') ? 'light' : 'dark';
    html.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  const switchTo = (next) => {
    if (next === mode) return;
    setMode(next);
    const p = loc.pathname;
    if (p.startsWith('/dashboard') || p.startsWith('/view')) return;
    navigate(next === 'my' ? '/me' : '/group');
  };

  if (!ready) return <div className="p-6">Checking access…</div>;
  if (!allowed) return <div className="p-6">Not active / not in any group. Contact superadmin.</div>;

  const logout = async () => { await supabase.auth.signOut(); navigate('/login'); };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 hidden md:flex flex-col gap-4 p-4 border-r border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900">
        <div className="px-2 pt-2">
          <div className="text-lg font-semibold tracking-wide">💸 Expense App</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Group aggregates · Personal entries</div>
        </div>

        {/* Segmented toggle */}
        <div className="p-1 bg-slate-200/70 dark:bg-slate-800/70 rounded-xl flex">
          <button
            onClick={() => switchTo('my')}
            className={`flex-1 px-3 py-2 rounded-lg ${mode==='my' ? 'bg-white text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}>
            My View
          </button>
          <button
            onClick={() => switchTo('group')}
            className={`flex-1 px-3 py-2 rounded-lg ${mode==='group' ? 'bg-white text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}>
            Group View
          </button>
        </div>

        {/* Menu */}
        <nav className="grid gap-2">
          <Link to="/dashboard" className="btn-ghost w-full text-left flex items-center">
            <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
          </Link>

          {mode === 'my' && (
            <Link to="/me/add" className="btn-ghost w-full text-left flex items-center">
              <PlusSquare className="w-4 h-4 mr-2" /> Add Expense
            </Link>
          )}

          <Link to="/view" className="btn-ghost w-full text-left flex items-center">
            <ReceiptText className="w-4 h-4 mr-2" /> View Expenses
          </Link>
          <Link to="/categories" className="btn-ghost w-full text-left flex items-center">
            <Tags className="w-4 h-4 mr-2" /> Categories
          </Link>
          <Link to="/budget" className="btn-ghost w-full text-left flex items-center">
            <WalletMinimal className="w-4 h-4 mr-2" /> Budget
          </Link>
          <Link to="/analysis" className="btn-ghost w-full text-left flex items-center">
            <LineChart className="w-4 h-4 mr-2" /> Analysis
          </Link>
          <Link to="/audit" className="btn-ghost w-full text-left flex items-center">
            <ClipboardList className="w-4 h-4 mr-2" /> Audit Logs
          </Link>

        </nav>

        {/* Access Management (superadmin only) */}
        {isAdmin && (
          <div className="mt-2">
            <div className="flex items-center justify-between px-2 text-xs uppercase tracking-wide text-slate-500">
              <span>Access Management</span>
              <button className="btn-ghost px-2 py-0.5" onClick={() => setOpenAdmin(o => !o)}>
                {openAdmin ? '▾' : '▸'}
              </button>
            </div>
            {openAdmin && (
              <div className="mt-2 grid gap-1 pl-2">
                <Link to="/admin/users" className="btn-ghost w-full text-left flex items-center">
                  <Users className="w-4 h-4 mr-2" /> User Management
                </Link>
                <Link to="/admin/groups" className="btn-ghost w-full text-left flex items-center">
                  <UserCog className="w-4 h-4 mr-2" /> Group Management
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="mt-auto grid gap-2">
          <div className="badge">{displayName || email}</div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={toggleTheme}>
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button className="btn flex-1" onClick={logout}>Logout</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Topbar (mobile) */}
        <header className="md:hidden sticky top-0 z-10 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="px-4 py-3 grid gap-2">
            <div className="flex items-center gap-3">
              <div className="font-semibold">💸 Expense App</div>
              <div className="ml-auto flex items-center gap-2">
                <Link to="/dashboard" className="btn-ghost">Dashboard</Link>
                {mode === 'my' && <Link to="/me/add" className="btn">Add Expense</Link>}
                <Link to="/view" className="btn-ghost">View</Link>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-8 grid gap-8">
          <Outlet />
        </main>

        <footer className="px-6 pb-6 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} — Built for groups & personal spend
        </footer>
      </div>
    </div>
  );
}
