import React, { useMemo } from 'react';
import { Activity, BarChart3, BriefcaseBusiness, CheckSquare, Clock3, DollarSign, Target, Timer, TrendingUp } from 'lucide-react';
import { Opportunity } from '../types';

export type IndicatorSection = 'financial' | 'monthly' | 'duration' | 'productivity' | 'longestTasks';

interface Props {
  opportunities: Opportunity[];
  hiddenSections?: IndicatorSection[];
  onSelectOpportunity: (id: string) => void;
}

const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const hours = (seconds: number) => `${(seconds / 3600).toFixed(seconds >= 36000 ? 0 : 1)} h`;
const monthKey = (date?: string | null) => (date || '').slice(0, 7);
const asDate = (value?: string | null) => value ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : null;
const daysBetween = (from?: string | null, to?: string | null) => {
  const start = asDate(from); const end = asDate(to) || new Date();
  return start && !Number.isNaN(start.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) : null;
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

export const IndicatorsDashboard: React.FC<Props> = ({ opportunities, hiddenSections = [], onSelectOpportunity }) => {
  const data = useMemo(() => {
    const price = (opp: Opportunity) => Number(opp.commercial?.cqaOfficialSellPrice || opp.kpis?.proposalAmountUSD || 0);
    const tasks = opportunities.flatMap(opp => (opp.tasks || []).map(task => ({ opp, task, seconds: (task.timeLogs || []).reduce((sum, log) => sum + (log.durationSeconds || 0), 0) })));
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const won = opportunities.filter(opp => opp.statusLabel === 'Won');
    const quoted = opportunities.filter(opp => opp.statusLabel !== 'Canceled');
    const margins = opportunities.map(opp => Number(opp.commercial?.cqaOfficialMargin)).filter(value => Number.isFinite(value) && value > 0);
    const byType = (quoteType: 'Firm' | 'Budgetary') => ['< $25k', '$25k–$100k', '> $100k'].map((bucket, index) => {
      const entries = opportunities.filter(opp => opp.quoteType === quoteType).map(opp => ({ amount: price(opp), days: daysBetween(opp.kpis?.timeline?.receivedAt, opp.kpis?.timeline?.deliveredAt) })).filter((entry): entry is { amount: number; days: number } => entry.days !== null).filter(entry => index === 0 ? entry.amount < 25000 : index === 1 ? entry.amount >= 25000 && entry.amount <= 100000 : entry.amount > 100000);
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
      totalQuoted: quoted.reduce((sum, opp) => sum + price(opp), 0), totalWon: won.reduce((sum, opp) => sum + price(opp), 0), wonCount: won.length,
      averageMargin: margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0,
      openAmount: opportunities.filter(opp => !['Won', 'Lost', 'Canceled'].includes(opp.statusLabel)).reduce((sum, opp) => sum + price(opp), 0),
      monthly: Array.from({ length: 12 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; return { key, label: date.toLocaleDateString(undefined, { month: 'short' }), count: opportunities.filter(opp => monthKey(opp.kpis?.timeline?.receivedAt || opp.lastUpdated) === key && (opp.srId || opp.qlk)).length }; }),
      firm: byType('Firm'), budgetary: byType('Budgetary'), standardTimes,
      timerThisMonth: tasks.reduce((sum, item) => sum + (item.task.timeLogs || []).filter(log => monthKey(log.start) === currentMonth).reduce((total, log) => total + (log.durationSeconds || 0), 0), 0),
      timerThisWeek: tasks.reduce((sum, item) => sum + (item.task.timeLogs || []).filter(log => { const date = asDate(log.start); return date && date >= weekStart; }).reduce((total, log) => total + (log.durationSeconds || 0), 0), 0),
      completedThisMonth: tasks.filter(({ task }) => task.status === 'Done' && (task.timeLogs || []).some(log => monthKey(log.end || log.start) === currentMonth)).length,
    };
  }, [opportunities]);
  const hidden = new Set(hiddenSections);
  const maxMonthly = Math.max(1, ...data.monthly.map(item => item.count));
  const maxStage = Math.max(1, ...data.standardTimes.map(item => item.average));
  return <div className="h-full overflow-y-auto bg-[#f1f3f4] p-6"><div className="mx-auto max-w-7xl space-y-6 pb-8">
    <div><h1 className="text-2xl font-black tracking-tight text-gray-900">Indicators</h1><p className="mt-1 text-sm text-gray-500">Commercial performance, productivity and execution times.</p></div>
    {!hidden.has('financial') && <section className="space-y-3"><h2 className="text-sm font-bold text-gray-700">Commercial summary</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><MetricCard label="Quoted amount" value={money(data.totalQuoted)} icon={DollarSign} accent="#16a34a"/><MetricCard label="Won OPs" value={String(data.wonCount)} icon={BriefcaseBusiness} accent="#059669"/><MetricCard label="Won amount" value={money(data.totalWon)} icon={TrendingUp} accent="#059669"/><MetricCard label="Win rate" value={`${data.totalQuoted ? ((data.totalWon / data.totalQuoted) * 100).toFixed(1) : '0.0'}%`} hint="Won amount / quoted" icon={Target} accent="#2563eb"/><MetricCard label="Average margin" value={`${data.averageMargin.toFixed(1)}%`} icon={Activity} accent="#7c3aed"/><MetricCard label="Open pipeline" value={money(data.openAmount)} icon={BarChart3} accent="#d97706"/></div></section>}
    {!hidden.has('monthly') && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-2"><BarChart3 size={18} className="text-[#3DCD58]"/><div><h2 className="text-sm font-bold text-gray-800">SRs created per month</h2><p className="text-xs text-gray-400">Last 12 months, based on the received date.</p></div></div><div className="flex h-44 items-end gap-2">{data.monthly.map(item => <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="text-[10px] font-bold text-gray-500">{item.count || ''}</span><div className="min-h-[2px] rounded-t bg-[#3DCD58]" style={{ height: `${Math.max(2, (item.count / maxMonthly) * 100)}%` }}/><span className="text-[10px] text-gray-400">{item.label}</span></div>)}</div></section>}
    {!hidden.has('duration') && <section className="space-y-3"><div className="flex items-center gap-2"><Clock3 size={18} className="text-blue-600"/><div><h2 className="text-sm font-bold text-gray-800">Average opportunity duration</h2><p className="text-xs text-gray-400">Comparison split by proposal type and amount.</p></div></div><div className="grid gap-4 lg:grid-cols-2"><DurationChart title="Budgetary" color="#f59e0b" rows={data.budgetary}/><DurationChart title="Firm" color="#2563eb" rows={data.firm}/></div></section>}
    {!hidden.has('productivity') && <section className="space-y-3"><h2 className="text-sm font-bold text-gray-700">Productivity</h2><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Time logged this month" value={hours(data.timerThisMonth)} icon={Timer} accent="#2563eb"/><MetricCard label="Time logged this week" value={hours(data.timerThisWeek)} icon={Clock3} accent="#7c3aed"/><MetricCard label="Tasks completed this month" value={String(data.completedThisMonth)} icon={CheckSquare} accent="#059669"/></div></section>}
    {!hidden.has('longestTasks') && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5"><h2 className="text-sm font-bold text-gray-800">Average time per process stage</h2><p className="text-xs text-gray-400">Your standard is calculated from timers on your own tasks, grouped by stage.</p></div>{data.standardTimes.length ? <div className="space-y-3">{data.standardTimes.map(item => <div key={item.stage} className="grid grid-cols-[minmax(120px,220px)_1fr_auto] items-center gap-3"><span className="truncate text-xs font-semibold text-gray-700" title={item.stage}>{item.stage}</span><div className="h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#3DCD58]" style={{ width: `${Math.max(2, (item.average / maxStage) * 100)}%` }}/></div><span className="text-xs font-black text-gray-700">{hours(item.average)} <span className="font-normal text-gray-400">({item.tasks})</span></span></div>)}</div> : <p className="text-sm text-gray-400">No timers yet on your own tasks with an assigned process stage.</p>}</section>}
  </div></div>;
};
