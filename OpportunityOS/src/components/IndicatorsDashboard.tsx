import React, { useMemo, useState } from 'react';
import { Activity, BarChart3, BriefcaseBusiness, Calendar, CheckSquare, ChevronDown, Clock3, DollarSign, GitBranch, History, Layers, Search, Table2, Target, Timer, TrendingUp } from 'lucide-react';
import { Opportunity } from '../types';
import { countCalendarDays } from '../services/dateUtils';

export type IndicatorSection = 'financial' | 'monthly' | 'duration' | 'productivity' | 'longestTasks';

interface Props {
  opportunities: Opportunity[];
  hiddenSections?: IndicatorSection[];
  /** Hides every metric derived from task timer logs. */
  timerEnabled?: boolean;
  onSelectOpportunity: (id: string) => void;
}

type PeriodPreset = 'all' | 'thisMonth' | 'last3' | 'last6' | 'last12' | 'thisYear' | 'custom';
const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'last3', label: 'Last 3 months' },
  { value: 'last6', label: 'Last 6 months' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const hours = (seconds: number) => `${(seconds / 3600).toFixed(seconds >= 36000 ? 0 : 1)} h`;
const monthKey = (date?: string | null) => (date || '').slice(0, 7);
const monthKeyOffset = (date: Date, offset: number) => { const d = new Date(date.getFullYear(), date.getMonth() + offset, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (key: string) => { const [y, m] = key.split('-').map(Number); return y && m ? new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' }) : key; };
const enumerateMonths = (startKey: string, endKey: string) => {
  const [sy, sm] = startKey.split('-').map(Number); const [ey, em] = endKey.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [] as string[];
  let y = sy, m = sm; const months: string[] = []; let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 60) { months.push(`${y}-${String(m).padStart(2, '0')}`); m += 1; if (m > 12) { m = 1; y += 1; } guard += 1; }
  return months.length ? months : [startKey];
};
const asDate = (value?: string | null) => value ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : null;
const daysBetween = (from?: string | null, to?: string | null) => {
  const start = asDate(from); const end = asDate(to) || new Date();
  return start && !Number.isNaN(start.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) : null;
};
const price = (opp: Opportunity) => Number(opp.commercial?.cqaOfficialSellPrice || opp.kpis?.proposalAmountUSD || 0);
// The live/current state of an OP always counts as its baseline revision (Rev 0), even when no
// explicit snapshot was ever saved — so every opportunity has at least 1 revision.
const revisionCount = (opp: Opportunity) => (opp.versionsCount ?? (opp.versions || []).length) + 1;
const revisionExpectedDates = (opp: Opportunity) => {
  const past = opp.versionsExpectedDates ?? (opp.versions || []).map(v => v.snapshot?.dates?.expected || '');
  return [...past, opp.dates?.expected || ''];
};
const AMOUNT_BUCKETS = ['< $100k', '$100k–$250k', '$250k–$500k', '$500k–$1M', '> $1M'];
const MIN_TASK_SECONDS = 25 * 60;
const amountBucketIndex = (amount: number) => amount < 100000 ? 0 : amount < 250000 ? 1 : amount < 500000 ? 2 : amount < 1000000 ? 3 : 4;
// Mirrors OpportunityDetail's "Elapsed Calendar Days" (Overview tab): inclusive day count from Received to Delivered (or a fallback end date).
const elapsedCalendarDays = (timeline?: { receivedAt?: string | null; deliveredAt?: string | null } | null, fallbackEnd?: string) => {
  if (!timeline?.receivedAt) return null;
  const end = timeline.deliveredAt || fallbackEnd;
  if (!end) return null;
  return countCalendarDays(timeline.receivedAt, end) + 1;
};

const MetricCard = ({ label, value, hint, icon: Icon, accent }: { label: string; value: string; hint?: string; icon: React.ElementType; accent: string }) => (
  <div className="relative min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-4 pr-14 shadow-sm">
    <div className="min-w-0">
      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 break-words text-lg font-black leading-tight text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
    <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}18`, color: accent }}><Icon size={18} strokeWidth={2.25} /></div>
  </div>
);

const DurationChart = ({ title, color, rows }: { title: string; color: string; rows: Array<{ bucket: string; average: number | null; count: number }> }) => {
  const max = Math.max(1, ...rows.map(row => row.average || 0));
  return <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="mb-5"><h3 className="text-sm font-bold text-gray-800">{title}</h3><p className="text-xs text-gray-400">Average days from Received to Delivered.</p></div>
    <div className="flex h-48 items-end gap-5 px-2">
      {rows.map(row => <div key={row.bucket} className="flex h-full flex-1 flex-col justify-end text-center">
        <span className="mb-1 text-xs font-black text-gray-700">{row.average === null ? '—' : `${row.average.toFixed(1)}d`}</span>
        <div className="mx-auto w-full max-w-20 rounded-t-lg transition-all" style={{ minHeight: row.average === null ? 2 : 6, height: `${row.average === null ? 1 : (row.average / max) * 100}%`, backgroundColor: color }} title={`${row.bucket}: ${row.count} OPs`} />
        <span className="mt-2 text-[10px] font-medium text-gray-500">{row.bucket}</span><span className="text-[10px] text-gray-400">{row.count} OPs</span>
      </div>)}
    </div>
  </div>;
};

export const IndicatorsDashboard: React.FC<Props> = ({ opportunities: allOpportunities, hiddenSections = [], timerEnabled = true, onSelectOpportunity }) => {
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const periodRange = useMemo(() => {
    const today = new Date();
    const currentKey = monthKeyOffset(today, 0);
    switch (period) {
      case 'thisMonth': return { start: currentKey, end: currentKey };
      case 'last3': return { start: monthKeyOffset(today, -2), end: currentKey };
      case 'last6': return { start: monthKeyOffset(today, -5), end: currentKey };
      case 'last12': return { start: monthKeyOffset(today, -11), end: currentKey };
      case 'thisYear': return { start: `${today.getFullYear()}-01`, end: currentKey };
      case 'custom': return (customFrom && customTo) ? { start: customFrom, end: customTo } : null;
      default: return null;
    }
  }, [period, customFrom, customTo]);
  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label || 'All time';
  // Every card/chart/table below is driven off this period-filtered set (by received date), except the
  // free-text search box, which intentionally searches the full unfiltered history.
  const opportunities = useMemo(() => {
    if (!periodRange) return allOpportunities;
    return allOpportunities.filter(opp => {
      const key = monthKey(opp.kpis?.timeline?.receivedAt || opp.lastUpdated);
      return !!key && key >= periodRange.start && key <= periodRange.end;
    });
  }, [allOpportunities, periodRange]);
  const monthWindow = useMemo(() => periodRange ? enumerateMonths(periodRange.start, periodRange.end) : Array.from({ length: 12 }, (_, i) => monthKeyOffset(new Date(), -11 + i)), [periodRange]);
  const data = useMemo(() => {
    const tasks = opportunities.flatMap(opp => (opp.tasks || []).map(task => {
      const seconds = (task.timeLogs || []).reduce((sum, log) => sum + (log.durationSeconds || 0), 0);
      const countsForMinimum = task.owner === 'Me' && !task.isAssignment && seconds === 0;
      return { opp, task, seconds, countsForMinimum };
    }));
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const won = opportunities.filter(opp => opp.statusLabel === 'Won');
    const quoted = opportunities.filter(opp => opp.statusLabel !== 'Canceled');
    const margins = opportunities.map(opp => Number(opp.commercial?.cqaOfficialMargin)).filter(value => Number.isFinite(value) && value > 0);
    const byType = (quoteType: 'Firm' | 'Budgetary') => AMOUNT_BUCKETS.map((bucket, index) => {
      const entries = opportunities.filter(opp => opp.quoteType === quoteType).map(opp => ({ amount: price(opp), days: daysBetween(opp.kpis?.timeline?.receivedAt, opp.kpis?.timeline?.deliveredAt) })).filter((entry): entry is { amount: number; days: number } => entry.days !== null).filter(entry => amountBucketIndex(entry.amount) === index);
      return { bucket, count: entries.length, average: entries.length ? entries.reduce((sum, entry) => sum + entry.days, 0) / entries.length : null };
    });
    const stageStats = new Map<string, { seconds: number; tasks: number }>();
    tasks.filter(item => item.task.owner === 'Me' && item.seconds > 0).forEach(item => {
      const stage = item.task.stageContext || 'Unassigned';
      const current = stageStats.get(stage) || { seconds: 0, tasks: 0 };
      current.seconds += item.seconds; current.tasks += 1; stageStats.set(stage, current);
    });
    const standardTimes = [...stageStats.entries()].map(([stage, value]) => ({ stage, tasks: value.tasks, average: value.seconds / value.tasks })).sort((a, b) => a.stage.localeCompare(b.stage, undefined, { numeric: true }));
    return {
      totalQuoted: quoted.reduce((sum, opp) => sum + price(opp), 0), totalWon: won.reduce((sum, opp) => sum + price(opp), 0), wonCount: won.length, totalCount: quoted.length,
      totalRevisions: opportunities.reduce((sum, opp) => sum + revisionCount(opp), 0),
      averageMargin: margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0,
      openAmount: opportunities.filter(opp => !['Won', 'Lost', 'Canceled'].includes(opp.statusLabel)).reduce((sum, opp) => sum + price(opp), 0),
      monthly: monthWindow.map(key => ({ key, label: monthLabel(key), count: opportunities.filter(opp => monthKey(opp.dates?.expected) === key && (opp.srId || opp.qlk)).length })),
      revisionMonthly: monthWindow.map(key => ({ key, label: monthLabel(key), count: opportunities.reduce((sum, opp) => sum + revisionExpectedDates(opp).filter(expected => monthKey(expected) === key).length, 0) })),
      firm: byType('Firm'), budgetary: byType('Budgetary'), standardTimes,
      timerThisMonth: tasks.reduce((sum, item) => {
        const real = (item.task.timeLogs || []).filter(log => monthKey(log.start) === currentMonth).reduce((total, log) => total + (log.durationSeconds || 0), 0);
        if (real > 0) return sum + real;
        if (item.countsForMinimum && monthKey(item.task.completedAt || item.task.dueDate) === currentMonth) return sum + MIN_TASK_SECONDS;
        return sum;
      }, 0),
      timerThisWeek: tasks.reduce((sum, item) => {
        const real = (item.task.timeLogs || []).filter(log => { const date = asDate(log.start); return date && date >= weekStart; }).reduce((total, log) => total + (log.durationSeconds || 0), 0);
        if (real > 0) return sum + real;
        if (item.countsForMinimum) {
          const fallbackDate = asDate(item.task.completedAt || item.task.dueDate);
          if (fallbackDate && fallbackDate >= weekStart) return sum + MIN_TASK_SECONDS;
        }
        return sum;
      }, 0),
      completedThisMonth: tasks.filter(({ task }) => task.owner === 'Me' && task.status === 'Done' && monthKey(task.completedAt || task.dueDate) === currentMonth).length,
      oppRows: opportunities.map(opp => {
        // Each past revision is a full snapshot with its own Received->Delivered window (kpis reset per revision);
        // the current revision has its own live window. Average the per-revision "Elapsed Calendar Days" across all of them.
        const revisionDays: number[] = [];
        (opp.versions || []).forEach(v => {
          const d = elapsedCalendarDays(v.snapshot?.kpis?.timeline, (v.createdAt || '').slice(0, 10));
          if (d !== null) revisionDays.push(d);
        });
        const currentDays = elapsedCalendarDays(opp.kpis?.timeline, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
        if (currentDays !== null) revisionDays.push(currentDays);
        return {
          id: opp.id,
          title: opp.title || 'Untitled',
          amount: price(opp),
          margin: Number(opp.commercial?.cqaOfficialMargin) || 0,
          isBudgetary: opp.quoteType === 'Budgetary',
          days: revisionDays.length ? revisionDays.reduce((sum, d) => sum + d, 0) / revisionDays.length : null,
          cseCalendarDays: daysBetween(opp.dates?.assigned || opp.kpis?.timeline?.receivedAt, opp.dates?.expected),
          revs: revisionCount(opp),
        };
      }).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })),
    };
  }, [opportunities, monthWindow]);
  const hidden = new Set(hiddenSections);
  const maxMonthly = Math.max(1, ...data.monthly.map(item => item.count));
  const maxRevisionMonthly = Math.max(1, ...data.revisionMonthly.map(item => item.count));
  const maxStage = Math.max(1, ...data.standardTimes.map(item => item.average));
  const [search, setSearch] = useState('');
  const [tableOpen, setTableOpen] = useState(true);
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allOpportunities
      .filter(opp => (opp.title || '').toLowerCase().includes(q) || (opp.srId || '').toLowerCase().includes(q) || (opp.qlk || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(opp => ({ opp, amount: price(opp), margin: Number(opp.commercial?.cqaOfficialMargin) || 0, days: daysBetween(opp.kpis?.timeline?.receivedAt, opp.kpis?.timeline?.deliveredAt), revs: revisionCount(opp) }));
  }, [allOpportunities, search]);
  return <div className="h-full overflow-y-auto bg-[#f1f3f4] p-6"><div className="mx-auto max-w-7xl space-y-6 pb-8">
    <div><h1 className="text-2xl font-black tracking-tight text-gray-900">Indicators</h1><p className="mt-1 text-sm text-gray-500">Commercial performance, productivity and execution times.</p></div>
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a proposal by title, SR or QLK…" className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-[#3DCD58] focus:bg-white" />
      </div>
      {search.trim() && (searchResults.length ? <div className="mt-3 space-y-2">{searchResults.map(({ opp, amount, margin, days, revs }) => (
        <button key={opp.id} onClick={() => onSelectOpportunity(opp.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-left hover:border-[#3DCD58] hover:bg-[#3DCD58]/5">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800">{opp.title || 'Untitled'}</p><p className="text-xs text-gray-400">{opp.srId || opp.qlk || '—'} · {opp.statusLabel}</p></div>
          <div className="flex shrink-0 gap-4 text-right">
            <div><p className="text-xs font-black text-gray-700">{money(amount)}</p><p className="text-[10px] text-gray-400">Amount</p></div>
            <div><p className="text-xs font-black text-gray-700">{margin ? `${margin.toFixed(1)}%` : '—'}</p><p className="text-[10px] text-gray-400">Margin</p></div>
            <div><p className="text-xs font-black text-gray-700">{days === null ? '—' : `${days}d`}</p><p className="text-[10px] text-gray-400">Duration</p></div>
            <div><p className="text-xs font-black text-gray-700">{revs}</p><p className="text-[10px] text-gray-400">Revs</p></div>
          </div>
        </button>
      ))}</div> : <p className="mt-3 text-sm text-gray-400">No proposals match "{search}".</p>)}
    </section>
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={16} className="text-gray-400" />
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Period</span>
        {PERIOD_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setPeriod(opt.value)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${period === opt.value ? 'bg-[#3DCD58] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{opt.label}</button>
        ))}
        {period === 'custom' && <div className="ml-1 flex items-center gap-2">
          <input type="month" lang="en-US" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#3DCD58]" />
          <span className="text-xs text-gray-400">to</span>
          <input type="month" lang="en-US" value={customTo} onChange={e => setCustomTo(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#3DCD58]" />
        </div>}
      </div>
    </section>
    {!hidden.has('financial') && <section className="space-y-3"><h2 className="text-sm font-bold text-gray-700">Commercial summary</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Total proposals" value={String(data.totalCount)} icon={Layers} accent="#0f766e"/><MetricCard label="Total revisions" value={String(data.totalRevisions)} icon={History} accent="#0369a1"/><MetricCard label="Quoted amount" value={money(data.totalQuoted)} icon={DollarSign} accent="#16a34a"/><MetricCard label="Won OPs" value={String(data.wonCount)} icon={BriefcaseBusiness} accent="#059669"/><MetricCard label="Won amount" value={money(data.totalWon)} icon={TrendingUp} accent="#059669"/><MetricCard label="Win rate" value={`${data.totalQuoted ? ((data.totalWon / data.totalQuoted) * 100).toFixed(1) : '0.0'}%`} hint="Won amount / quoted" icon={Target} accent="#2563eb"/><MetricCard label="Average margin" value={`${data.averageMargin.toFixed(1)}%`} icon={Activity} accent="#7c3aed"/><MetricCard label="Open pipeline" value={money(data.openAmount)} icon={BarChart3} accent="#d97706"/></div></section>}
    {!hidden.has('monthly') && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-2"><BarChart3 size={18} className="text-[#3DCD58]"/><div><h2 className="text-sm font-bold text-gray-800">OPs created per month</h2><p className="text-xs text-gray-400">{periodLabel}, based on the Expected date.</p></div></div><div className="flex h-44 items-end gap-2">{data.monthly.map(item => <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="text-[10px] font-bold text-gray-500">{item.count || ''}</span><div className="min-h-[2px] rounded-t bg-[#3DCD58]" style={{ height: `${Math.max(2, (item.count / maxMonthly) * 100)}%` }}/><span className="text-[10px] text-gray-400">{item.label}</span></div>)}</div></section>}
    {!hidden.has('monthly') && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-2"><GitBranch size={18} className="text-sky-600"/><div><h2 className="text-sm font-bold text-gray-800">SRs created per month</h2><p className="text-xs text-gray-400">{periodLabel}, based on each revision's own Expected date.</p></div></div><div className="flex h-44 items-end gap-2">{data.revisionMonthly.map(item => <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="text-[10px] font-bold text-gray-500">{item.count || ''}</span><div className="min-h-[2px] rounded-t bg-sky-500" style={{ height: `${Math.max(2, (item.count / maxRevisionMonthly) * 100)}%` }}/><span className="text-[10px] text-gray-400">{item.label}</span></div>)}</div></section>}
    {!hidden.has('duration') && <section className="space-y-3"><div className="flex items-center gap-2"><Clock3 size={18} className="text-blue-600"/><div><h2 className="text-sm font-bold text-gray-800">Average opportunity duration</h2><p className="text-xs text-gray-400">Comparison split by proposal type and amount.</p></div></div><div className="grid gap-4 lg:grid-cols-2"><DurationChart title="Budgetary" color="#f59e0b" rows={data.budgetary}/><DurationChart title="Firm" color="#2563eb" rows={data.firm}/></div></section>}
    {!hidden.has('productivity') && <section className="space-y-3"><h2 className="text-sm font-bold text-gray-700">Productivity</h2><div className={`grid gap-3 ${timerEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>{timerEnabled && <><MetricCard label="Time logged this month" value={hours(data.timerThisMonth)} icon={Timer} accent="#2563eb"/><MetricCard label="Time logged this week" value={hours(data.timerThisWeek)} icon={Clock3} accent="#7c3aed"/></>}<MetricCard label="Tasks completed this month" value={String(data.completedThisMonth)} icon={CheckSquare} accent="#059669"/></div></section>}
    {timerEnabled && !hidden.has('longestTasks') && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5"><h2 className="text-sm font-bold text-gray-800">Average time per process stage</h2><p className="text-xs text-gray-400">Your standard is calculated from timers on your own tasks, grouped by stage.</p></div>{data.standardTimes.length ? <div className="space-y-3">{data.standardTimes.map(item => <div key={item.stage} className="grid grid-cols-[minmax(120px,220px)_1fr_auto] items-center gap-3"><span className="truncate text-xs font-semibold text-gray-700" title={item.stage}>{item.stage}</span><div className="h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#3DCD58]" style={{ width: `${Math.max(2, (item.average / maxStage) * 100)}%` }}/></div><span className="text-xs font-black text-gray-700">{hours(item.average)} <span className="font-normal text-gray-400">({item.tasks})</span></span></div>)}</div> : <p className="text-sm text-gray-400">No timers yet on your own tasks with an assigned process stage.</p>}</section>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <button onClick={() => setTableOpen(o => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2"><Table2 size={18} className="text-gray-500"/><div><h2 className="text-sm font-bold text-gray-800">Opportunities detail</h2><p className="text-xs text-gray-400">Amount, margin, quote type, duration, CSE calendar commitment and revisions.</p></div></div>
        <ChevronDown size={18} className={`shrink-0 text-gray-400 transition-transform ${tableOpen ? 'rotate-180' : ''}`}/>
      </button>
      {tableOpen && (data.oppRows.length ? <div className="mt-4 max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-100 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
            <th className="pb-2 pr-3">Opportunity</th><th className="pb-2 pr-3">Amount</th><th className="pb-2 pr-3">Margin</th><th className="pb-2 pr-3">Type</th><th className="pb-2 pr-3">Time</th><th className="pb-2 pr-3">CSE days</th><th className="pb-2">Revs</th>
          </tr></thead>
          <tbody>{data.oppRows.map(row => (
            <tr key={row.id} onClick={() => onSelectOpportunity(row.id)} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50">
              <td className="max-w-[260px] truncate py-2 pr-3 font-semibold text-gray-800" title={row.title}>{row.title}</td>
              <td className="py-2 pr-3 text-gray-700">{money(row.amount)}</td>
              <td className="py-2 pr-3 text-gray-700">{row.margin ? `${row.margin.toFixed(1)}%` : '—'}</td>
              <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.isBudgetary ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{row.isBudgetary ? 'Budgetary' : 'Firm'}</span></td>
              <td className="py-2 pr-3 text-gray-700">{row.days === null ? '—' : `${row.days.toFixed(1)}d`}</td>
              <td className="py-2 pr-3 text-gray-700" title="Calendar days from Assigned/Received to Expected">{row.cseCalendarDays === null ? '—' : `${row.cseCalendarDays}d`}</td>
              <td className="py-2 text-gray-700">{row.revs}</td>
            </tr>
          ))}</tbody>
        </table>
      </div> : <p className="mt-3 text-sm text-gray-400">No proposals yet.</p>)}
    </section>
  </div></div>;
};
