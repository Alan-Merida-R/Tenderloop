import React from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause, StopCircle, Clock, Settings, SkipForward, ExternalLink, Pin } from 'lucide-react';

const FLOATING_TIMER_WINDOW_STORAGE_KEY = 'tenderloop_floating_timer_window_v2';
const FLOATING_TIMER_STOP_RESIZE_FLAG = 'tenderloop_timer_stop_resize';

const readFloatingTimerWindowSize = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(FLOATING_TIMER_WINDOW_STORAGE_KEY) || 'null');
        const width = Number(saved?.width);
        const height = Number(saved?.height);
        if (Number.isFinite(width) && Number.isFinite(height)) {
            return { width: Math.min(Math.max(width, 380), 940), height: Math.min(Math.max(height, 190), 600) };
        }
    } catch { /* Ignore malformed saved popup sizes. */ }
    return { width: 600, height: 260 };
};

const saveFloatingTimerWindowSize = (width: number, height: number) => {
    try { localStorage.setItem(FLOATING_TIMER_WINDOW_STORAGE_KEY, JSON.stringify({ width, height })); }
    catch { /* Storage is optional. */ }
};

interface TimerWidgetProps {
    onTaskClick?: (taskId: string, oppId: string) => void;
    /** Renders the independent Windows popup opened from the in-app widget. */
    floating?: boolean;
}

export const TimerWidget = ({ onTaskClick, floating = false }: TimerWidgetProps) => {
    const { timerState, startTimer, pauseTimer, stopTimer, formatTime, openStartModal, pomodoroConfig, phaseTargetSeconds, skipPomodoroPhase, openPomodoroSettings } = useTimer();
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        if (!timerState.isRunning) { setTick(0); return; }
        const interval = window.setInterval(() => setTick(value => value + 1), 250);
        return () => window.clearInterval(interval);
    }, [timerState.isRunning, timerState.taskId, timerState.pomodoroPhase]);

    // The provider exposes the work total as of its last render, while this
    // widget updates locally four times per second. Anchor the accumulated
    // portion once so those local ticks do not add the active run twice.
    const workElapsedAnchorRef = React.useRef({ key: '', baseSeconds: 0 });
    const displaySeconds = React.useMemo(() => {
        if (!timerState.isRunning || timerState.pomodoroPhase !== 'work' || !timerState.startTime) return timerState.elapsedSeconds;
        const activeSeconds = Math.max(0, Math.floor((Date.now() - timerState.startTime) / 1000));
        const key = [timerState.taskId, timerState.oppId, timerState.startTime, timerState.elapsedSeconds, timerState.pomodoroPhase].join('|');
        if (workElapsedAnchorRef.current.key !== key) {
            workElapsedAnchorRef.current = { key, baseSeconds: Math.max(0, timerState.elapsedSeconds - activeSeconds) };
        }
        return workElapsedAnchorRef.current.baseSeconds + activeSeconds;
    }, [timerState.isRunning, timerState.pomodoroPhase, timerState.startTime, timerState.elapsedSeconds, timerState.taskId, timerState.oppId, tick]);

    const phaseElapsed = React.useMemo(() => {
        if (!timerState.isRunning || !timerState.pomodoroPhaseStart) return timerState.pomodoroPhaseAccumulated || 0;
        return (timerState.pomodoroPhaseAccumulated || 0) + Math.max(0, Math.floor((Date.now() - timerState.pomodoroPhaseStart) / 1000));
    }, [timerState.isRunning, timerState.pomodoroPhaseStart, timerState.pomodoroPhaseAccumulated, tick]);
    const phaseRemaining = Math.max(0, phaseTargetSeconds - phaseElapsed);
    const isBreak = pomodoroConfig.enabled && timerState.pomodoroPhase !== 'work';
    const phaseLabel = timerState.pomodoroPhase === 'work' ? 'Focus' : timerState.pomodoroPhase === 'shortBreak' ? 'Short break' : 'Long break';

    React.useEffect(() => {
        document.title = timerState.isRunning
            ? `${pomodoroConfig.enabled ? `${phaseLabel} ${formatTime(phaseRemaining)}` : formatTime(displaySeconds)} · ${timerState.taskTitle || 'Timer'} | Tender Control`
            : 'Tender Control';
    }, [displaySeconds, formatTime, phaseLabel, phaseRemaining, pomodoroConfig.enabled, timerState.isRunning, timerState.taskTitle]);

    const wasActiveRef = React.useRef(false);
    React.useEffect(() => {
        if (timerState.isRunning || timerState.taskId) { wasActiveRef.current = true; return; }
        if (wasActiveRef.current && floating && timerState.elapsedSeconds === 0) {
            wasActiveRef.current = false;
            const timeout = window.setTimeout(() => window.close(), 250);
            return () => window.clearTimeout(timeout);
        }
    }, [floating, timerState.elapsedSeconds, timerState.isRunning, timerState.taskId]);

    const popOut = React.useCallback(() => {
        const size = readFloatingTimerWindowSize();
        window.open(`${window.location.pathname}?window=timer`, 'opportunityos_timer', `popup=yes,width=${size.width},height=${size.height},resizable=yes,menubar=no,toolbar=no,location=no,status=no`);
    }, []);

    const resume = () => {
        if (timerState.taskId && timerState.oppId && timerState.taskTitle) startTimer(timerState.taskId, timerState.oppId, timerState.taskTitle);
    };

    if (floating) {
        return <FloatingTimerPanel timerState={timerState} isBreak={isBreak} phaseLabel={phaseLabel} phaseRemaining={phaseRemaining} phaseTargetSeconds={phaseTargetSeconds} displaySeconds={displaySeconds} pomodoroEnabled={pomodoroConfig.enabled} onPause={pauseTimer} onResume={resume} onStop={stopTimer} onSkip={skipPomodoroPhase} onOpenStart={openStartModal} onOpenSettings={openPomodoroSettings} formatTime={formatTime} />;
    }

    if (!timerState.isRunning && timerState.elapsedSeconds === 0) {
        return <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 animate-in fade-in zoom-in duration-300">
            <button onClick={openPomodoroSettings} className="rounded-full border border-gray-700 bg-gray-900/95 p-2 text-white shadow-lg transition-transform hover:scale-110" title="Pomodoro settings"><Settings className="h-4 w-4 text-gray-300" /></button>
            <button onClick={openStartModal} className="group flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/95 p-3 text-white shadow-xl transition-transform hover:scale-110" title="Start timer"><Clock className="h-5 w-5 text-[#3DCD58]" /><span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold transition-all duration-300 group-hover:max-w-xs">Timer ready{pomodoroConfig.enabled ? ' · Pomodoro' : ''}</span></button>
        </div>;
    }

    return <div className={`fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border p-3 text-white shadow-2xl backdrop-blur-md ${isBreak ? 'border-red-800 bg-red-950/95' : 'border-slate-700 bg-slate-950/95'}`}>
        <div className="min-w-0 flex-1">
            {pomodoroConfig.enabled && <div className="mb-1 flex items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${isBreak ? 'bg-white/15 text-white' : 'bg-[#3DCD58]/20 text-[#3DCD58]'}`}>{phaseLabel}</span><span className="text-[9px] text-white/60">#{timerState.pomodoroCycleIndex + (timerState.pomodoroPhase === 'work' ? 1 : 0)}</span></div>}
            <button onClick={() => timerState.taskId && timerState.oppId && onTaskClick?.(timerState.taskId, timerState.oppId)} className="block max-w-[min(48vw,22rem)] break-words text-left text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-[#3DCD58]" title="Open task details">{timerState.taskTitle || 'No task'}</button>
            <div className="mt-1 font-mono text-xl font-bold leading-none tabular-nums">{pomodoroConfig.enabled ? formatTime(phaseRemaining) : formatTime(displaySeconds)}</div>
            {pomodoroConfig.enabled && <div className="mt-1 text-[9px] tabular-nums text-white/60">of {formatTime(phaseTargetSeconds)} · Work {formatTime(displaySeconds)}</div>}
        </div>
        <Controls running={timerState.isRunning} pomodoroEnabled={pomodoroConfig.enabled} onPause={pauseTimer} onResume={resume} onSkip={skipPomodoroPhase} onSettings={openPomodoroSettings} onStop={stopTimer} />
        <button onClick={popOut} className="rounded-full p-2 transition-colors hover:bg-white/15" title="Open movable floating timer"><ExternalLink className="h-4 w-4" /></button>
    </div>;
};

interface FloatingPanelProps {
    timerState: { isRunning: boolean; taskId: string | null; oppId: string | null; taskTitle: string | null; elapsedSeconds: number; pomodoroPhase: 'work' | 'shortBreak' | 'longBreak'; pomodoroCycleIndex: number; };
    isBreak: boolean; phaseLabel: string; phaseRemaining: number; phaseTargetSeconds: number; displaySeconds: number; pomodoroEnabled: boolean;
    onPause: () => void; onResume: () => void; onStop: () => void; onSkip: () => void; onOpenStart: () => void; onOpenSettings: () => void; formatTime: (seconds: number) => string;
}

const Controls: React.FC<{ running: boolean; pomodoroEnabled: boolean; onPause: () => void; onResume: () => void; onSkip: () => void; onSettings: () => void; onStop: () => void; }> = ({ running, pomodoroEnabled, onPause, onResume, onSkip, onSettings, onStop }) => <div className="flex shrink-0 items-center gap-1">
    <button onClick={running ? onPause : onResume} className="rounded-lg p-2 transition-colors hover:bg-white/10" title={running ? 'Pause' : 'Resume'}>{running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
    {pomodoroEnabled && <button onClick={onSkip} className="rounded-lg p-2 transition-colors hover:bg-white/10" title="Skip phase"><SkipForward className="h-4 w-4" /></button>}
    <button onClick={onSettings} className="rounded-lg p-2 transition-colors hover:bg-white/10" title="Pomodoro settings"><Settings className="h-4 w-4" /></button>
    <button onClick={onStop} className="rounded-lg p-2 text-red-300 transition-colors hover:bg-red-500/15" title="Stop"><StopCircle className="h-5 w-5" /></button>
</div>;

const FloatingTimerPanel: React.FC<FloatingPanelProps> = props => {
    const { timerState, isBreak, phaseLabel, phaseRemaining, phaseTargetSeconds, displaySeconds, pomodoroEnabled, onPause, onResume, onStop, onSkip, onOpenStart, onOpenSettings, formatTime } = props;
    const hasSession = timerState.isRunning || !!timerState.taskId || timerState.elapsedSeconds > 0;
    const [viewport, setViewport] = React.useState({ width: window.innerWidth, height: window.innerHeight });
    const [alwaysOnTop, setAlwaysOnTop] = React.useState(false);

    React.useEffect(() => {
        let saveTimer: number | undefined;
        const resize = () => {
            const next = { width: window.innerWidth, height: window.innerHeight };
            setViewport(next);
            if (sessionStorage.getItem(FLOATING_TIMER_STOP_RESIZE_FLAG) !== '1') {
                window.clearTimeout(saveTimer);
                saveTimer = window.setTimeout(() => saveFloatingTimerWindowSize(next.width, next.height), 200);
            }
        };
        resize(); window.addEventListener('resize', resize);
        return () => { window.clearTimeout(saveTimer); window.removeEventListener('resize', resize); };
    }, []);

    const toggleAlwaysOnTop = async () => {
        const next = !alwaysOnTop;
        try {
            const response = await fetch('http://127.0.0.1:3099/api/os/timer-window-topmost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: document.title, enabled: next }) });
            if (!response.ok) throw new Error();
            setAlwaysOnTop(next);
        } catch { alert('Could not change the Windows always-on-top setting. Keep the Tender Control helper running.'); }
    };

    const compact = viewport.width < 480 || viewport.height < 220;
    const timeSize = Math.max(34, Math.min(92, viewport.width * (compact ? 0.13 : 0.16), viewport.height * 0.38));
    const primaryTime = pomodoroEnabled ? formatTime(phaseRemaining) : formatTime(displaySeconds);
    const accent = isBreak ? 'text-rose-300' : 'text-emerald-300';
    const background = isBreak ? 'from-[#210b12] via-[#160a10] to-[#2b1119] border-rose-900/80' : 'from-[#111827] via-[#0b1220] to-[#111827] border-slate-700';

    return <main className={`flex h-screen min-h-0 w-screen flex-col overflow-auto border bg-gradient-to-br p-3 text-white ${background}`}>
        <header className="flex min-w-0 items-start justify-between gap-2 border-b border-white/10 pb-2">
            <div className="min-w-0"><div className={`text-[10px] font-black uppercase tracking-[0.18em] ${accent}`}>{pomodoroEnabled ? phaseLabel : 'Timer'}</div><h1 className="mt-0.5 break-words text-xs font-semibold leading-snug text-slate-100" title={timerState.taskTitle || 'No task selected'}>{timerState.taskTitle || 'No task selected'}</h1></div>
            <div className="flex shrink-0 items-center gap-1"><button onClick={toggleAlwaysOnTop} className={`rounded-md p-1.5 ${alwaysOnTop ? 'bg-emerald-400/20 text-emerald-200' : 'text-slate-300 hover:bg-white/10'}`} title={alwaysOnTop ? 'Disable always on top' : 'Keep above other Windows windows'}><Pin className="h-4 w-4" /></button><button onClick={onOpenSettings} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10" title="Pomodoro settings"><Settings className="h-4 w-4" /></button></div>
        </header>
        <section className={`flex min-h-[96px] flex-1 ${compact ? 'flex-col gap-2 py-3' : 'items-center justify-between gap-5 py-4'}`}>
            <div className="min-w-0"><div className="font-mono font-black leading-none tabular-nums tracking-tight text-white" style={{ fontSize: timeSize }}>{primaryTime}</div>{pomodoroEnabled && <div className="mt-2 font-mono text-[11px] tabular-nums text-slate-400">Phase {formatTime(phaseTargetSeconds)} · Work {formatTime(displaySeconds)}</div>}</div>
            {hasSession ? <Controls running={timerState.isRunning} pomodoroEnabled={pomodoroEnabled} onPause={onPause} onResume={onResume} onSkip={onSkip} onSettings={onOpenSettings} onStop={onStop} /> : <button onClick={onOpenStart} className="inline-flex items-center gap-2 self-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"><Clock className="h-4 w-4" />Start timer</button>}
        </section>
        <footer className="border-t border-white/10 pt-2 text-[10px] text-slate-400">Move and resize this rectangle with the normal Windows window controls. <span className="text-slate-300">Use the pin to keep it above all other windows.</span></footer>
    </main>;
};
