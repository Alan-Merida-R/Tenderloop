
import React from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause, StopCircle, Clock, Settings, SkipForward, ExternalLink } from 'lucide-react';

const FLOATING_TIMER_WINDOW_STORAGE_KEY = 'tenderloop_floating_timer_window_v1';
const IN_PAGE_TIMER_CLOCK_STORAGE_KEY = 'tenderloop_in_page_timer_clock_v1';
const FLOATING_TIMER_STOP_RESIZE_FLAG = 'tenderloop_timer_stop_resize';

const readFloatingTimerWindowSize = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(FLOATING_TIMER_WINDOW_STORAGE_KEY) || 'null');
        const width = Number(saved?.width);
        const height = Number(saved?.height);
        if (Number.isFinite(width) && Number.isFinite(height)) {
            return {
                // A clock needs enough vertical room for its readout and controls.
                // Older 190px popup sizes are upgraded automatically instead of
                // compressing controls into the dial.
                width: Math.min(Math.max(width, 340), 620),
                height: Math.min(Math.max(height, 420), 680),
            };
        }
    } catch {
        // Ignore malformed saved popup sizes.
    }
    return { width: 380, height: 480 };
};

const saveFloatingTimerWindowSize = (width: number, height: number) => {
    try {
        localStorage.setItem(FLOATING_TIMER_WINDOW_STORAGE_KEY, JSON.stringify({ width, height }));
    } catch {
        // Ignore storage errors.
    }
};

interface TimerWidgetProps {
    onTaskClick?: (taskId: string, oppId: string) => void;
    // Render the Windows-Clock-style layout used when the widget is popped out into its
    // own small browser window. Big digital digits centered, dim-red for breaks, auto-close
    // after logging time.
    floating?: boolean;
}

export const TimerWidget = ({ onTaskClick, floating = false }: TimerWidgetProps) => {
    const {
        timerState, startTimer, pauseTimer, stopTimer, formatTime, openStartModal,
        pomodoroConfig, phaseTargetSeconds,
        skipPomodoroPhase, openPomodoroSettings,
    } = useTimer();
    const [tick, setTick] = React.useState(0);

    // A short local pulse drives live re-computation from absolute timestamps.
    // The main widget and popup mount at different moments, so a 1s interval can
    // make them visibly disagree by almost a full second.
    React.useEffect(() => {
        let interval: any;
        if (timerState.isRunning) {
            interval = setInterval(() => setTick(t => t + 1), 250);
        } else {
            setTick(0);
        }
        return () => clearInterval(interval);
    }, [timerState.isRunning, timerState.taskId, timerState.pomodoroPhase]);

    const workElapsedAnchorRef = React.useRef({
        key: '',
        baseElapsedSeconds: 0,
    });

    const displaySeconds = React.useMemo(() => {
        // Anchor the visible work timer to the shared absolute startTime. The
        // provider elapsed value is already live-at-render, so subtracting the
        // current run seconds gives both windows the same accumulated base.
        if (!timerState.isRunning || timerState.pomodoroPhase !== 'work' || !timerState.startTime) {
            return timerState.elapsedSeconds;
        }

        const now = Date.now();
        const sessionSecondsAtRender = Math.floor((now - timerState.startTime) / 1000);
        const syncKey = [
            timerState.taskId || '',
            timerState.oppId || '',
            timerState.startTime,
            timerState.pomodoroPhase,
            timerState.elapsedSeconds,
        ].join('|');

        if (workElapsedAnchorRef.current.key !== syncKey) {
            workElapsedAnchorRef.current = {
                key: syncKey,
                baseElapsedSeconds: Math.max(0, timerState.elapsedSeconds - sessionSecondsAtRender),
            };
        }

        return workElapsedAnchorRef.current.baseElapsedSeconds
            + Math.floor((Date.now() - timerState.startTime) / 1000);
    }, [
        timerState.isRunning,
        timerState.elapsedSeconds,
        timerState.startTime,
        timerState.pomodoroPhase,
        timerState.taskId,
        timerState.oppId,
        tick,
    ]);

    // BUG FIX: phaseElapsedSeconds from context is captured at the last TimerProvider
    // render, which only happens when timerState/config changes. During a break/focus
    // phase nothing changes per second so the context value was frozen — the countdown
    // appeared to "pause" for several seconds before jumping forward. Compute locally.
    const phaseElapsedLive = React.useMemo(() => {
        const base = timerState.pomodoroPhaseAccumulated || 0;
        if (timerState.isRunning && timerState.pomodoroPhaseStart) {
            return base + Math.floor((Date.now() - timerState.pomodoroPhaseStart) / 1000);
        }
        return base;
    }, [timerState.isRunning, timerState.pomodoroPhaseStart, timerState.pomodoroPhaseAccumulated, tick]);

    const phaseRemaining = Math.max(0, phaseTargetSeconds - phaseElapsedLive);

    const isBreak = pomodoroConfig.enabled && timerState.pomodoroPhase !== 'work';
    const phaseLabel = timerState.pomodoroPhase === 'work'
        ? 'Focus'
        : timerState.pomodoroPhase === 'shortBreak' ? 'Short Break' : 'Long Break';

    React.useEffect(() => {
        if (timerState.isRunning) {
            const prefix = pomodoroConfig.enabled
                ? `[${phaseLabel} ${formatTime(phaseRemaining)}]`
                : `[${formatTime(displaySeconds)}]`;
            document.title = `${prefix} ${timerState.taskTitle || 'Timer'} | OpportunityOS`;
        } else {
            document.title = 'OpportunityOS';
        }
    }, [displaySeconds, phaseRemaining, timerState.isRunning, timerState.taskTitle, pomodoroConfig.enabled, phaseLabel]);

    // Auto-close the popup window when the user stops & logs the task. The stop flow
    // goes: stopTimer() -> StopTimerModal -> confirmStop() -> DEFAULT_STATE. Watching
    // for isRunning=false + no task + no elapsed signals the session fully ended.
    const wasActiveRef = React.useRef(false);
    React.useEffect(() => {
        if (timerState.isRunning || timerState.taskId) {
            wasActiveRef.current = true;
            return;
        }
        if (wasActiveRef.current && floating && timerState.elapsedSeconds === 0) {
            wasActiveRef.current = false;
            // Small delay so the user sees the "stopped" state briefly before the
            // window disappears. Keeps the interaction feeling intentional.
            const t = window.setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 250);
            return () => window.clearTimeout(t);
        }
    }, [timerState.isRunning, timerState.taskId, timerState.elapsedSeconds, floating]);

    const popOut = React.useCallback(() => {
        const url = `${window.location.pathname}?window=timer`;
        const size = readFloatingTimerWindowSize();
        window.open(url, 'tenderloop_timer', `popup=yes,width=${size.width},height=${size.height},resizable=yes,menubar=no,toolbar=no,location=no,status=no`);
    }, []);

    // Floating / popup layout: big Windows-Clock-style digital readout.
    if (floating) {
        return (
            <FloatingTimerPanel
                timerState={timerState}
                isBreak={isBreak}
                phaseLabel={phaseLabel}
                phaseRemaining={phaseRemaining}
                phaseTargetSeconds={phaseTargetSeconds}
                displaySeconds={displaySeconds}
                pomodoroEnabled={pomodoroConfig.enabled}
                onPause={pauseTimer}
                onResume={() => startTimer(timerState.taskId!, timerState.oppId!, timerState.taskTitle!)}
                onStop={() => {
                    try {
                        sessionStorage.setItem(FLOATING_TIMER_STOP_RESIZE_FLAG, '1');
                        window.resizeTo(640, 760);
                        window.moveTo(Math.max(0, Math.round((window.screen.availWidth - 640) / 2)), Math.max(0, Math.round((window.screen.availHeight - 760) / 2)));
                    } catch {
                        // Browser may block scripted resize/move; the modal remains scrollable.
                    }
                    stopTimer();
                }}
                onSkip={skipPomodoroPhase}
                onOpenStart={openStartModal}
                onOpenSettings={openPomodoroSettings}
                formatTime={formatTime}
            />
        );
    }

    if (!timerState.isRunning && timerState.elapsedSeconds === 0) {
        return (
            <div className="fixed bottom-4 right-4 z-[100] animate-in fade-in zoom-in duration-300 flex items-center gap-2">
                <button
                    onClick={openPomodoroSettings}
                    className="bg-gray-900/90 text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform border border-gray-700"
                    title="Pomodoro settings"
                >
                    <Settings className="w-4 h-4 text-gray-300" />
                </button>
                <button
                    onClick={openStartModal}
                    className="bg-gray-900/90 text-white p-3 rounded-full shadow-xl hover:scale-110 transition-transform border border-gray-700 group flex items-center gap-2"
                    title="Start Timer"
                >
                    <Clock className="w-5 h-5 text-[#3DCD58]" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 text-xs font-bold whitespace-nowrap">
                        Timer Ready{pomodoroConfig.enabled ? ' · Pomodoro' : ''}
                    </span>
                </button>
            </div>
        );
    }

    // Darker, clearer red for breaks — distinguishable without being alarming.
    const bgClass = isBreak
        ? 'bg-red-900/92 border-red-800'
        : 'bg-gray-900/90 border-gray-700';

    return (
        <div className={`fixed bottom-4 right-4 backdrop-blur-md text-white p-3 rounded-2xl flex items-center gap-3 shadow-2xl z-[100] animate-slide-in-up border transition-all hover:scale-105 ${bgClass}`}>
            <div className="flex flex-col min-w-[140px]">
                {pomodoroConfig.enabled && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${isBreak ? 'bg-white/20 text-white' : 'bg-[#3DCD58]/20 text-[#3DCD58]'}`}>
                            {phaseLabel}
                        </span>
                        <span className="text-[9px] opacity-70">
                            #{timerState.pomodoroCycleIndex + (timerState.pomodoroPhase === 'work' ? 1 : 0)}
                        </span>
                    </div>
                )}
                <button
                    onClick={() => timerState.taskId && onTaskClick?.(timerState.taskId, timerState.oppId!)}
                    className="text-[10px] text-gray-300 font-bold uppercase tracking-wider max-w-[180px] truncate hover:text-[#3DCD58] transition-colors text-left focus:outline-none"
                    title="View Task Details"
                >
                    {timerState.taskTitle || 'No Task'}
                </button>
                {/* Pomodoro: big = phase countdown, small = preset total. Stopwatch: big = total. */}
                {pomodoroConfig.enabled ? (
                    <>
                        <span className="text-xl font-mono font-bold leading-none tabular-nums">
                            {formatTime(phaseRemaining)}
                        </span>
                        <span className="text-[9px] opacity-60 mt-0.5 tabular-nums">
                            of {formatTime(phaseTargetSeconds)} · Work {formatTime(displaySeconds)}
                        </span>
                    </>
                ) : (
                    <span className="text-xl font-mono font-bold leading-none tabular-nums">
                        {formatTime(displaySeconds)}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1">
                {timerState.isRunning ? (
                    <button onClick={pauseTimer} className="p-2 hover:bg-white/15 rounded-full transition-colors" title="Pause"><Pause className="w-5 h-5" /></button>
                ) : (
                    <button onClick={() => startTimer(timerState.taskId!, timerState.oppId!, timerState.taskTitle!)} className="p-2 hover:bg-white/15 rounded-full transition-colors" title="Resume"><Play className="w-5 h-5" /></button>
                )}
                {pomodoroConfig.enabled && (
                    <button onClick={skipPomodoroPhase} className="p-2 hover:bg-white/15 rounded-full transition-colors" title="Skip phase">
                        <SkipForward className="w-4 h-4" />
                    </button>
                )}
                <button onClick={openPomodoroSettings} className="p-2 hover:bg-white/15 rounded-full transition-colors" title="Pomodoro settings">
                    <Settings className="w-4 h-4" />
                </button>
                <button onClick={popOut} className="p-2 hover:bg-white/15 rounded-full transition-colors" title="Open in floating window">
                    <ExternalLink className="w-4 h-4" />
                </button>
                <button
                    onClick={stopTimer}
                    className="p-2 hover:bg-red-900/50 text-red-300 rounded-full transition-colors"
                    title="Stop"
                >
                    <StopCircle className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

// Windows-Clock-style digital display used in the popup window. Big centered digits,
// compact header/controls, dim-red palette while on break.
interface FloatingPanelProps {
    timerState: {
        isRunning: boolean;
        taskId: string | null;
        oppId: string | null;
        taskTitle: string | null;
        elapsedSeconds: number;
        pomodoroPhase: 'work' | 'shortBreak' | 'longBreak';
        pomodoroCycleIndex: number;
    };
    isBreak: boolean;
    phaseLabel: string;
    phaseRemaining: number;
    phaseTargetSeconds: number;
    displaySeconds: number;
    pomodoroEnabled: boolean;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onSkip: () => void;
    onOpenStart: () => void;
    onOpenSettings: () => void;
    onOpenTask?: () => void;
    formatTime: (s: number) => string;
}

const readInPageTimerClockState = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(IN_PAGE_TIMER_CLOCK_STORAGE_KEY) || 'null');
        const size = Number(saved?.size);
        const left = Number(saved?.left);
        const top = Number(saved?.top);
        if (Number.isFinite(size) && Number.isFinite(left) && Number.isFinite(top)) {
            return {
                size: Math.min(Math.max(size, 190), 420),
                left: Math.max(8, left),
                top: Math.max(8, top),
            };
        }
    } catch {
        // Ignore malformed saved state.
    }
    const fallbackSize = 250;
    return {
        size: fallbackSize,
        left: typeof window === 'undefined' ? 24 : Math.max(24, window.innerWidth - fallbackSize - 24),
        top: typeof window === 'undefined' ? 120 : Math.max(24, window.innerHeight - fallbackSize - 24),
    };
};

const saveInPageTimerClockState = (state: { size: number; left: number; top: number }) => {
    try {
        localStorage.setItem(IN_PAGE_TIMER_CLOCK_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore storage errors.
    }
};

const InPageTimerClock: React.FC<FloatingPanelProps> = ({
    timerState, isBreak, phaseLabel, phaseRemaining, phaseTargetSeconds, displaySeconds, pomodoroEnabled,
    onPause, onResume, onStop, onSkip, onOpenSettings, onOpenTask, formatTime,
}) => {
    const [clock, setClock] = React.useState(readInPageTimerClockState);
    const dragRef = React.useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; startLeft: number; startTop: number; startSize: number } | null>(null);

    React.useEffect(() => {
        saveInPageTimerClockState(clock);
    }, [clock]);

    React.useEffect(() => {
        const clampToViewport = () => {
            setClock(prev => ({
                ...prev,
                left: Math.min(Math.max(8, prev.left), Math.max(8, window.innerWidth - prev.size - 8)),
                top: Math.min(Math.max(8, prev.top), Math.max(8, window.innerHeight - prev.size - 8)),
            }));
        };
        window.addEventListener('resize', clampToViewport);
        return () => window.removeEventListener('resize', clampToViewport);
    }, []);

    const updateFromPointer = React.useCallback((e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.mode === 'move') {
            const nextLeft = drag.startLeft + e.clientX - drag.startX;
            const nextTop = drag.startTop + e.clientY - drag.startY;
            setClock(prev => ({
                ...prev,
                left: Math.min(Math.max(8, nextLeft), Math.max(8, window.innerWidth - prev.size - 8)),
                top: Math.min(Math.max(8, nextTop), Math.max(8, window.innerHeight - prev.size - 8)),
            }));
            return;
        }

        const delta = Math.max(e.clientX - drag.startX, e.clientY - drag.startY);
        const nextSize = Math.min(Math.max(190, drag.startSize + delta), 420);
        setClock({
            size: nextSize,
            left: Math.min(Math.max(8, drag.startLeft), Math.max(8, window.innerWidth - nextSize - 8)),
            top: Math.min(Math.max(8, drag.startTop), Math.max(8, window.innerHeight - nextSize - 8)),
        });
    }, []);

    const stopPointerAction = React.useCallback(() => {
        dragRef.current = null;
        window.removeEventListener('pointermove', updateFromPointer);
    }, [updateFromPointer]);

    const startPointerAction = (e: React.PointerEvent, mode: 'move' | 'resize') => {
        e.preventDefault();
        dragRef.current = {
            mode,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: clock.left,
            startTop: clock.top,
            startSize: clock.size,
        };
        window.addEventListener('pointermove', updateFromPointer);
        window.addEventListener('pointerup', stopPointerAction, { once: true });
    };

    const isTiny = clock.size < 220;
    const isCompact = clock.size < 275;
    const timeFontSize = Math.max(34, Math.min(78, clock.size * 0.22));
    const bgClass = isBreak
        ? 'bg-rose-50/70 border-red-200/80 text-red-950'
        : 'bg-white/62 border-emerald-200/80 text-slate-900';

    return (
        <div
            className={`fixed z-[100] select-none rounded-full border-4 ${bgClass} shadow-2xl backdrop-blur-md animate-in fade-in zoom-in duration-200`}
            style={{
                width: clock.size,
                height: clock.size,
                left: clock.left,
                top: clock.top,
                boxShadow: isBreak
                    ? '0 18px 40px rgba(127,29,29,0.16), inset 0 0 30px rgba(255,255,255,0.45)'
                    : '0 18px 40px rgba(15,23,42,0.14), inset 0 0 34px rgba(255,255,255,0.5)',
            }}
            onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                startPointerAction(e, 'move');
            }}
            title="Drag to move"
        >
            <div className="pointer-events-none absolute inset-[10px] rounded-full border border-slate-900/10" />
            <div className="pointer-events-none absolute inset-[22px] rounded-full border border-white/60" />
            <button
                type="button"
                className="absolute bottom-7 right-7 h-5 w-5 cursor-nwse-resize rounded-full border border-slate-300/80 bg-white/75 shadow-sm hover:bg-white"
                title="Drag to resize"
                onPointerDown={(e) => startPointerAction(e, 'resize')}
            />

            <div className={`${isCompact ? 'px-8 pt-6' : 'px-11 pt-8'} h-full flex flex-col items-center justify-between`}>
                <div className="w-full min-w-0 text-center">
                    <button
                        type="button"
                        onClick={onOpenTask}
                        className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} max-w-full truncate font-black uppercase tracking-[0.12em] text-slate-700/80 hover:text-[#228b3b]`}
                        title={timerState.taskTitle || 'No task'}
                    >
                        {timerState.taskTitle || phaseLabel}
                    </button>
                    {pomodoroEnabled && !isTiny && (
                        <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            {phaseLabel}
                        </div>
                    )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
                    <div
                        className="font-mono font-black tabular-nums leading-none"
                        style={{
                            fontSize: timeFontSize,
                            fontFamily: '"Courier New", "Roboto Mono", "SFMono-Regular", monospace',
                            color: isBreak ? '#7f1d1d' : '#0f172a',
                            textShadow: isBreak ? '0 2px 10px rgba(254,202,202,0.75)' : '0 2px 12px rgba(16,185,129,0.22)',
                        }}
                    >
                        {pomodoroEnabled ? formatTime(phaseRemaining) : formatTime(displaySeconds)}
                    </div>
                    {pomodoroEnabled && !isTiny && (
                        <div className="mt-2 text-[10px] font-mono tabular-nums text-slate-500">
                            {formatTime(phaseTargetSeconds)}
                        </div>
                    )}
                </div>

                <div className={`${isCompact ? 'pb-5' : 'pb-7'} flex items-center justify-center gap-1 text-slate-700`}>
                    {timerState.isRunning ? (
                        <button type="button" onClick={onPause} title="Pause" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                            <Pause className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                    ) : (
                        <button type="button" onClick={onResume} title="Resume" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                            <Play className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                    )}
                    {pomodoroEnabled && (
                        <button type="button" onClick={onSkip} title="Skip phase" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                            <SkipForward className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                    )}
                    <button type="button" onClick={onOpenSettings} title="Pomodoro settings" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                        <Settings className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                    </button>
                    <button type="button" onClick={onStop} title="Stop" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full text-red-600 hover:bg-red-100 transition-colors`}>
                        <StopCircle className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const FloatingTimerPanel: React.FC<FloatingPanelProps> = ({
    timerState, isBreak, phaseLabel, phaseRemaining, phaseTargetSeconds, displaySeconds, pomodoroEnabled,
    onPause, onResume, onStop, onSkip, onOpenStart, onOpenSettings, formatTime,
}) => {
    const hasSession = timerState.isRunning || !!timerState.taskId || timerState.elapsedSeconds > 0;
    const [viewport, setViewport] = React.useState(() => ({
        width: typeof window === 'undefined' ? 320 : window.innerWidth,
        height: typeof window === 'undefined' ? 230 : window.innerHeight,
    }));

    React.useEffect(() => {
        let saveTimer: number | undefined;
        const handleResize = () => {
            const next = { width: window.innerWidth, height: window.innerHeight };
            setViewport(next);
            if (sessionStorage.getItem(FLOATING_TIMER_STOP_RESIZE_FLAG) === '1') return;
            window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => saveFloatingTimerWindowSize(next.width, next.height), 250);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.clearTimeout(saveTimer);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    React.useEffect(() => {
        const previousBodyBackground = document.body.style.background;
        const previousHtmlBackground = document.documentElement.style.background;
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';
        return () => {
            document.body.style.background = previousBodyBackground;
            document.documentElement.style.background = previousHtmlBackground;
        };
    }, []);

    // Leave consistent breathing room around the clock face. The popup is now
    // intentionally taller than wide, so labels and transport controls never
    // compete with the central time display.
    const dialSize = Math.max(280, Math.min(viewport.width - 28, viewport.height - 28, 500));
    const isTiny = dialSize < 320;
    const isCompact = dialSize < 360;
    const readoutFontSize = Math.max(42, Math.min(82, dialSize * 0.22));
    const resizeDragRef = React.useRef<{ startX: number; startY: number; startSize: number } | null>(null);
    const startResize = (e: React.PointerEvent) => {
        e.preventDefault();
        resizeDragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startSize: Math.min(window.outerWidth || viewport.width, window.outerHeight || viewport.height),
        };
        window.addEventListener('pointermove', handleResizeDrag);
        window.addEventListener('pointerup', stopResizeDrag, { once: true });
    };
    const handleResizeDrag = (e: PointerEvent) => {
        const drag = resizeDragRef.current;
        if (!drag) return;
        const delta = Math.max(e.clientX - drag.startX, e.clientY - drag.startY);
        const next = Math.min(Math.max(drag.startSize + delta, 190), 520);
        saveFloatingTimerWindowSize(next, next);
        try {
            window.resizeTo(next, next);
        } catch {
            setViewport({ width: next, height: next });
        }
    };
    const stopResizeDrag = () => {
        resizeDragRef.current = null;
        window.removeEventListener('pointermove', handleResizeDrag);
    };

    const bg = isBreak
        ? 'bg-gradient-to-br from-rose-50 via-white to-red-100 text-red-950 border-red-200'
        : 'bg-gradient-to-br from-white via-emerald-50 to-slate-100 text-slate-900 border-emerald-200';

    return (
        <div className="w-full h-full min-h-0 overflow-auto bg-slate-950/5 p-3 flex items-center justify-center">
        <div
            className={`${bg} relative overflow-hidden rounded-full border-4 shadow-2xl flex flex-col`}
            style={{
                width: dialSize,
                height: dialSize,
                boxShadow: isBreak
                    ? 'inset 0 0 34px rgba(255,255,255,0.8), 0 14px 38px rgba(127,29,29,0.18)'
                    : 'inset 0 0 42px rgba(255,255,255,0.9), 0 14px 38px rgba(15,23,42,0.16)',
            }}
        >
            <div className="pointer-events-none absolute inset-[12px] rounded-full border border-slate-900/10" />
            <div className="pointer-events-none absolute inset-[28px] rounded-full border border-white/70" />
            <div
                className="absolute bottom-7 right-7 z-20 h-5 w-5 cursor-nwse-resize rounded-full border border-slate-300/70 bg-white/75 shadow-sm hover:bg-white"
                title="Drag to resize"
                onPointerDown={startResize}
            />

            <div className={`${isCompact ? 'px-9 pt-7 text-[9px]' : 'px-12 pt-9 text-[10px]'} flex shrink-0 items-center justify-between font-black uppercase tracking-[0.14em] opacity-80`}>
                <span className="truncate" title={timerState.taskTitle || phaseLabel}>
                    {timerState.taskTitle || phaseLabel}
                </span>
                <div className="flex items-center gap-1">
                    <button onClick={onOpenSettings} title="Pomodoro settings" className={`${isCompact ? 'p-0.5' : 'p-1'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                        <Settings className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                    </button>
                </div>
            </div>

            <div className={`${isCompact ? 'px-7' : 'px-10'} flex min-h-0 flex-1 flex-col items-center justify-center`}>
                {hasSession ? (
                    <>
                        {/* Primary big readout: phase countdown in pomodoro mode, total elapsed otherwise */}
                        <div className="font-mono font-black tabular-nums leading-none tracking-normal"
                            style={{
                                fontSize: readoutFontSize,
                                fontFamily: '"Courier New", "Roboto Mono", "SFMono-Regular", monospace',
                                letterSpacing: '0',
                                color: isBreak ? '#7f1d1d' : '#0f172a',
                                textShadow: isBreak ? '0 2px 10px rgba(254,202,202,0.9)' : '0 2px 12px rgba(16,185,129,0.28)',
                            }}>
                            {pomodoroEnabled ? formatTime(phaseRemaining) : formatTime(displaySeconds)}
                        </div>
                        {pomodoroEnabled && !isTiny && (
                            <div className={`${isCompact ? 'mt-1 text-[9px]' : 'mt-2 text-[11px]'} font-mono tabular-nums opacity-70`}>
                                preset {formatTime(phaseTargetSeconds)}
                            </div>
                        )}
                        {timerState.taskTitle && !isTiny && (
                            <div className={`${isCompact ? 'mt-1 text-[9px]' : 'mt-2 text-[10px]'} max-w-full truncate text-center font-bold uppercase tracking-[0.12em] opacity-70`} title={timerState.taskTitle}>
                                {timerState.taskTitle}
                            </div>
                        )}
                    </>
                ) : (
                    <button onClick={onOpenStart} className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-full bg-slate-900 text-white hover:bg-slate-700 font-bold flex items-center gap-2 transition-colors`}>
                        <Clock className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> Start timer
                    </button>
                )}
            </div>

            {hasSession && (
                <div className={`${isCompact ? 'px-9 pb-7' : 'px-12 pb-9'} flex shrink-0 items-center justify-center gap-3`}>
                    {timerState.isRunning ? (
                        <button onClick={onPause} title="Pause" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                            <Pause className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                    ) : (
                        <button onClick={onResume} title="Resume" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                            <Play className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                    )}
                    {pomodoroEnabled && (
                        <button onClick={onSkip} title="Skip phase" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-slate-900/10 transition-colors`}>
                            <SkipForward className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                    )}
                    <button onClick={onStop} title="Stop" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-red-100 text-red-600 transition-colors`}>
                        <StopCircle className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                    </button>
                </div>
            )}
        </div>
        </div>
    );
};
