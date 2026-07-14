import React from 'react';
import { Activity, ExternalLink, History, X, Zap } from 'lucide-react';
import { Opportunity } from '../types';
import { getNextTask } from '../services/taskUtils';

const CHANNEL_NAME = 'tenderloop_process_radial_widget';
const WINDOW_SIZE_KEY = 'tenderloop_process_radial_window_v1';

type WidgetMessage =
  | { type: 'snapshot'; opportunities: Opportunity[] }
  | { type: 'requestSnapshot' }
  | { type: 'select'; oppId: string };

interface ProcessRadialWidgetProps {
  opportunities: Opportunity[];
  onSelectOpportunity?: (id: string) => void;
  floating?: boolean;
}

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const raw = value.split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const daysBetween = (from: Date, to: Date) => {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / 86400000);
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getScreenBounds = () => {
  try {
    return {
      width: window.screen?.availWidth || 1280,
      height: window.screen?.availHeight || 800,
    };
  } catch {
    return { width: 1280, height: 800 };
  }
};

const getWindowSize = () => {
  const screen = getScreenBounds();
  // Clamp to the actual screen, not an arbitrary small box, so the user can
  // resize the popup to literally whatever size they want (the resize itself
  // is unrestricted; this only bounds what gets restored from a saved size).
  const maxWidth = Math.max(320, screen.width - 24);
  const maxHeight = Math.max(320, screen.height - 24);
  try {
    const saved = JSON.parse(localStorage.getItem(WINDOW_SIZE_KEY) || 'null');
    const width = Number(saved?.width);
    const height = Number(saved?.height);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return {
        width: clamp(width, 260, maxWidth),
        height: clamp(height, 260, maxHeight),
      };
    }
  } catch {
    // Ignore malformed window size.
  }
  // Default to a generous chunk of the screen (not a cramped fixed box) so the
  // widget doesn't open wasting most of the window on empty background.
  return {
    width: Math.round(clamp(screen.width * 0.55, 480, maxWidth)),
    height: Math.round(clamp(screen.height * 0.65, 520, maxHeight)),
  };
};

const saveWindowSize = () => {
  try {
    localStorage.setItem(WINDOW_SIZE_KEY, JSON.stringify({
      width: window.outerWidth,
      height: window.outerHeight,
    }));
  } catch {
    // Ignore storage errors.
  }
};

const interpolateColor = (ratio: number) => {
  const safe = clamp(ratio, 0, 1);
  const hue = 4 + safe * 138;
  return `hsl(${hue}, 78%, 54%)`;
};

const getUrgencyLabel = (remainingDays: number, missingExpected: boolean) => {
  if (missingExpected) return 'No deadline';
  if (remainingDays < 0) return 'Overdue';
  if (remainingDays === 0) return 'Today';
  if (remainingDays <= 2) return 'Critical';
  if (remainingDays <= 5) return 'Soon';
  return 'On track';
};

const getOpportunityInitials = (opp: Opportunity) => {
  const label = (opp.alias || opp.id || opp.title || 'OP').trim();
  const parts = label.split(/[\s-_]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return label.slice(0, 3).toUpperCase();
};

const buildMetric = (opp: Opportunity) => {
  const today = startOfToday();
  const requested = parseLocalDate(opp.dates?.requested) || parseLocalDate(opp.dates?.assigned) || today;
  const expected = parseLocalDate(opp.dates?.expected) || new Date(requested.getTime() + 30 * 86400000);
  const totalDays = Math.max(1, daysBetween(requested, expected));
  // Total calendar days elapsed since the opportunity was requested, uncapped by
  // the expected-completion window — this is the "how long has this been going"
  // metric used to sort the widget (oldest-running opportunities first).
  const elapsedDays = Math.max(0, daysBetween(requested, today));
  const remainingDays = daysBetween(today, expected);
  const remainingRatio = clamp(remainingDays / totalDays, 0, 1);
  const tasks = opp.tasks || [];
  const doneTasks = tasks.filter(task => task.status === 'Done').length;
  const taskProgressRatio = tasks.length > 0 ? doneTasks / tasks.length : 0;
  const taskProgressPercent = Math.round(taskProgressRatio * 100);
  return {
    totalDays,
    elapsedDays,
    remainingDays,
    remainingRatio,
    taskProgressRatio,
    taskProgressPercent,
    doneTasks,
    totalTasks: tasks.length,
    color: interpolateColor(remainingRatio),
    overdue: remainingDays < 0,
    missingExpected: !opp.dates?.expected,
    urgencyLabel: getUrgencyLabel(remainingDays, !opp.dates?.expected),
  };
};

export const openProcessRadialWidgetWindow = () => {
  const size = getWindowSize();
  const url = `${window.location.pathname}?window=process-radial`;
  window.open(url, 'tenderloop_process_radial', `popup=yes,width=${size.width},height=${size.height},resizable=yes,menubar=no,toolbar=no,location=no,status=no`);
};

export const ProcessRadialWidget: React.FC<ProcessRadialWidgetProps> = ({ opportunities, onSelectOpportunity, floating = false }) => {
  const [remoteOpportunities, setRemoteOpportunities] = React.useState<Opportunity[]>([]);
  const [windowSize, setWindowSize] = React.useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 360,
    height: typeof window !== 'undefined' ? window.innerHeight : 520,
  }));
  const [tick, setTick] = React.useState(0);
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  const sourceOpportunities = floating && remoteOpportunities.length > 0 ? remoteOpportunities : opportunities;

  const getSnapshotPayload = React.useCallback(() => {
    return opportunities
      .filter(opp => opp.statusLabel === 'In Progress' || opp.statusLabel === 'On Hold')
      .map(opp => ({ ...opp, _originalRef: undefined, _searchIndex: undefined }));
  }, [opportunities]);

  React.useEffect(() => {
    const interval = window.setInterval(() => setTick(value => value + 1), 60000);
    return () => window.clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!floating) return;
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [floating]);

  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<WidgetMessage>) => {
      if (event.data?.type === 'snapshot' && floating) {
        setRemoteOpportunities(event.data.opportunities || []);
      }
      if (event.data?.type === 'requestSnapshot' && !floating) {
        channel.postMessage({ type: 'snapshot', opportunities: getSnapshotPayload() } satisfies WidgetMessage);
      }
      if (event.data?.type === 'select' && !floating) {
        onSelectOpportunity?.(event.data.oppId);
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [floating, getSnapshotPayload, onSelectOpportunity]);

  React.useEffect(() => {
    if (floating || typeof BroadcastChannel === 'undefined') return;
    const channel = channelRef.current || new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'snapshot', opportunities: getSnapshotPayload() } satisfies WidgetMessage);
    if (!channelRef.current) channel.close();
  }, [floating, getSnapshotPayload, sourceOpportunities]);

  React.useEffect(() => {
    if (!floating || typeof BroadcastChannel === 'undefined') return;
    const timer = window.setTimeout(() => {
      channelRef.current?.postMessage({ type: 'requestSnapshot' } satisfies WidgetMessage);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [floating]);

  React.useEffect(() => {
    if (!floating) return;
    window.addEventListener('beforeunload', saveWindowSize);
    return () => window.removeEventListener('beforeunload', saveWindowSize);
  }, [floating]);

  const activeOpps = React.useMemo(() => {
    void tick;
    return sourceOpportunities
      .filter(opp => opp.statusLabel === 'In Progress' || opp.statusLabel === 'On Hold')
      .map(opp => ({ opp, metric: buildMetric(opp) }))
      // Longest-running opportunities (most calendar days elapsed) first.
      .sort((a, b) => b.metric.elapsedDays - a.metric.elapsedDays);
  }, [sourceOpportunities, tick]);

  const displayMode = !floating
    ? 'launcher'
    : windowSize.width < 280 || windowSize.height < 300
      ? 'tiny'
      : windowSize.width < 420 || windowSize.height < 430
        ? 'compact'
        // Plenty of room: switch to a richer card that also surfaces the last
        // history event and next step instead of leaving the extra space blank.
        : windowSize.width >= 640 && windowSize.height >= 560
          ? 'expanded'
          : 'normal';

  const handleOpenWindow = () => {
    openProcessRadialWidgetWindow();
    const payload = getSnapshotPayload();
    window.setTimeout(() => {
      const channel = channelRef.current || new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'snapshot', opportunities: payload } satisfies WidgetMessage);
      if (!channelRef.current) channel.close();
    }, 300);
  };

  const handleSelect = (oppId: string) => {
    if (floating) {
      channelRef.current?.postMessage({ type: 'select', oppId } satisfies WidgetMessage);
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
        } else {
          window.open(`${window.location.pathname}?openOpportunity=${encodeURIComponent(oppId)}`, 'tenderloop_main');
        }
      } catch {
        window.open(`${window.location.pathname}?openOpportunity=${encodeURIComponent(oppId)}`, 'tenderloop_main');
      }
      return;
    }
    onSelectOpportunity?.(oppId);
  };

  if (!floating) {
    return (
      <button
        type="button"
        onClick={handleOpenWindow}
        className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 rounded-2xl border border-slate-700/40 bg-slate-950/88 px-3 py-2 text-xs font-black text-white shadow-2xl shadow-slate-950/25 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3DCD58]/60"
        title="Open process radial window"
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/8 ring-1 ring-white/10">
          <Activity className="h-4 w-4 text-[#3DCD58]" />
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#3DCD58] px-1 text-[9px] leading-4 text-slate-950">
            {activeOpps.length}
          </span>
        </span>
        <span className="hidden sm:flex flex-col items-start leading-none">
          <span className="text-[11px] uppercase tracking-[0.14em] text-white/85">Process</span>
          <span className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/42">Open widget</span>
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-white/45" />
      </button>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden border-0 bg-slate-950/88 text-white backdrop-blur-2xl ring-1 ring-white/10">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(61,205,88,0.16),rgba(15,23,42,0)_42%,rgba(59,130,246,0.10))] pointer-events-none" />
      <div className="relative flex h-full min-h-0 flex-col">
        <div className={`relative flex-1 overflow-y-auto ${displayMode === 'tiny' ? 'px-1.5 py-1.5' : 'px-2 py-2 sm:px-3 sm:py-3'}`}>
          {activeOpps.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full border border-white/10 bg-white/5 p-4">
                <Activity className="h-7 w-7 text-white/45" />
              </div>
              {displayMode !== 'tiny' && (
                <>
                  <p className="text-sm font-black text-white">No active opportunities</p>
                  <p className="mt-1 max-w-[240px] text-xs text-white/45">Only In Progress and On Hold opportunities appear here.</p>
                </>
              )}
            </div>
          ) : (
            <div className={`grid ${
              displayMode === 'tiny'
                ? 'grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1.5'
                : displayMode === 'compact'
                  ? 'grid-cols-[repeat(auto-fit,minmax(90px,1fr))] gap-2'
                  : displayMode === 'expanded'
                    ? 'grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4'
                    : 'grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3'
            }`}>
              {activeOpps.map(({ opp, metric }) => (
                <RadialOpportunityButton
                  key={opp.id}
                  opportunity={opp}
                  metric={metric}
                  mode={displayMode}
                  onSelect={() => handleSelect(opp.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 shrink-0 text-[#3DCD58]" />
            <span className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
              {activeOpps.length} active
            </span>
          </div>
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-full p-1.5 text-white/65 transition-colors hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const RadialOpportunityButton = ({
  opportunity,
  metric,
  mode,
  onSelect,
}: {
  opportunity: Opportunity;
  metric: ReturnType<typeof buildMetric>;
  mode: string;
  onSelect: () => void;
}) => {
  const isTiny = mode === 'tiny';
  const isCompact = mode === 'compact';
  const isExpanded = mode === 'expanded';
  const radius = isTiny ? 44 : 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - metric.taskProgressRatio);
  const daysLabel = metric.overdue
    ? `${Math.abs(metric.remainingDays)}d late`
    : `${metric.remainingDays}d left`;
  const alias = (opportunity.alias || opportunity.id || opportunity.title).trim();
  const lastHistoryEvent = isExpanded
    ? [...(opportunity.history || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.content
    : undefined;
  const nextTask = isExpanded ? getNextTask(opportunity.tasks || []) : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${isTiny ? 'rounded-full border-transparent bg-transparent p-0.5 shadow-none' : isCompact ? 'rounded-[16px] p-1.5' : 'rounded-[22px] p-2.5'} group min-w-0 border border-white/10 bg-white/[0.055] text-left shadow-lg transition-all hover:-translate-y-0.5 hover:bg-white/[0.09] hover:shadow-emerald-950/30 focus:outline-none focus:ring-2 focus:ring-[#3DCD58]/60`}
      title={`${alias} - ${metric.taskProgressPercent}% tasks - ${daysLabel}`}
    >
      <div className={`${isTiny ? 'block' : 'block'}`}>
        <div className={`${isTiny ? 'h-[58px] w-[58px]' : isCompact ? 'h-[76px] w-[76px]' : 'h-[108px] w-[108px]'} relative mx-auto shrink-0`}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90 drop-shadow-lg">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={metric.color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full">
          {!isTiny && !isCompact && (
            <span className="max-w-[70px] truncate text-center text-sm font-black tracking-tight text-white" title={alias}>
              {alias}
            </span>
          )}
          <span className={`${isTiny ? 'text-[15px]' : isCompact ? 'text-[16px]' : 'text-[20px]'} font-black tabular-nums text-white`}>
            {metric.taskProgressPercent}%
          </span>
          {!isTiny && !isCompact && (
            <span className="mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase text-white/75">
              tasks
            </span>
          )}
        </div>
      </div>

        <div className={`${isTiny ? 'mt-0.5' : 'mt-1.5'} min-w-0 text-center`}>
          <p className={`${isTiny ? 'mx-auto max-w-[58px] text-[8px] leading-[10px]' : isCompact ? 'text-[10px]' : 'text-xs'} truncate font-black text-white`} title={alias}>{alias}</p>
          {!isTiny && (
          <>
          <div className={`${isCompact ? 'mt-1' : 'mt-2'} flex flex-wrap items-center justify-center gap-1`}>
            <span
              className={`${isCompact ? 'px-1.5 text-[8px]' : 'px-2 text-[9px]'} rounded-full py-0.5 font-black uppercase text-slate-950`}
              style={{ backgroundColor: metric.color }}
              title="Urgency is based on remaining delivery days"
            >
              {metric.urgencyLabel}
            </span>
            <span className={`${isCompact ? 'px-1.5 text-[8px]' : 'px-2 text-[9px]'} rounded-full py-0.5 font-black uppercase ${metric.overdue ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-white/75'}`}>
              {daysLabel}
            </span>
          </div>
          {!isCompact && <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white/35">
            {metric.doneTasks}/{metric.totalTasks} tasks{metric.missingExpected ? ' - no deadline' : ''}
          </p>}
          </>
          )}
        </div>
      </div>
      {!isTiny && !isCompact && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${metric.taskProgressPercent}%`, backgroundColor: metric.color }}
        />
      </div>}
      {!isTiny && !isCompact && <p className="mt-1.5 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">
        {opportunity.statusLabel} - {metric.elapsedDays}d elapsed
        </p>}
      {isExpanded && (nextTask || lastHistoryEvent) && (
        <div className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2 text-left">
          {nextTask && (
            <div className="flex items-start gap-1.5">
              <Zap className="mt-0.5 h-3 w-3 shrink-0 text-blue-300" />
              <p className="min-w-0 flex-1 text-[10px] leading-snug text-white/70">
                <span className="font-black uppercase tracking-wide text-white/40">Next: </span>
                <span className="line-clamp-2">{nextTask.title}</span>
              </p>
            </div>
          )}
          {lastHistoryEvent && (
            <div className="flex items-start gap-1.5">
              <History className="mt-0.5 h-3 w-3 shrink-0 text-white/40" />
              <p className="min-w-0 flex-1 text-[10px] leading-snug text-white/55 line-clamp-2">{lastHistoryEvent}</p>
            </div>
          )}
        </div>
      )}
    </button>
  );
};
