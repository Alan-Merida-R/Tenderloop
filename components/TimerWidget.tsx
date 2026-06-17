
import React from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause, StopCircle, Clock, Settings, SkipForward, ExternalLink } from 'lucide-react';

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
            document.title = `${prefix} ${timerState.taskTitle || 'Timer'} | TenderLoop`;
        } else {
            document.title = 'TenderLoop';
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
        window.open(url, 'tenderloop_timer', 'width=320,height=230,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
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
                onStop={stopTimer}
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
    formatTime: (s: number) => string;
}

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
        const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isTiny = viewport.width < 250 || viewport.height < 165;
    const isCompact = isTiny || viewport.width < 310 || viewport.height < 215;
    const readoutFontSize = isTiny ? '30px' : isCompact ? '42px' : '64px';

    const bg = isBreak
        ? 'bg-gradient-to-br from-red-950 to-red-900 text-white'
        : 'bg-gradient-to-br from-slate-900 to-slate-800 text-gray-100';

    return (
        <div className={`w-full h-full min-h-0 overflow-hidden ${isCompact ? 'rounded-lg' : 'rounded-2xl'} ${bg} flex flex-col shadow-inner`}>
            <div className={`${isCompact ? 'px-2 pt-1.5 text-[9px]' : 'px-4 pt-3 text-[10px]'} flex shrink-0 items-center justify-between font-black uppercase tracking-[0.14em] opacity-80`}>
                <span className="truncate">{pomodoroEnabled ? phaseLabel : 'Timer'}</span>
                <div className="flex items-center gap-1">
                    <button onClick={onOpenSettings} title="Pomodoro settings" className={`${isCompact ? 'p-0.5' : 'p-1'} rounded hover:bg-white/15 transition-colors`}>
                        <Settings className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                    </button>
                </div>
            </div>

            <div className={`${isCompact ? 'px-2' : 'px-4'} flex min-h-0 flex-1 flex-col items-center justify-center`}>
                {hasSession ? (
                    <>
                        {/* Primary big readout: phase countdown in pomodoro mode, total elapsed otherwise */}
                        <div className="font-mono font-black tabular-nums leading-none tracking-normal"
                            style={{ fontSize: readoutFontSize, textShadow: isBreak ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 12px rgba(61,205,88,0.35)' }}>
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
                    <button onClick={onOpenStart} className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg bg-white/15 hover:bg-white/25 font-bold flex items-center gap-2 transition-colors`}>
                        <Clock className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> Start timer
                    </button>
                )}
            </div>

            {hasSession && (
                <div className={`${isCompact ? 'px-2 pb-1.5' : 'px-4 pb-3'} flex shrink-0 items-center justify-center gap-1`}>
                    {timerState.isRunning ? (
                        <button onClick={onPause} title="Pause" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-white/20 transition-colors`}>
                            <Pause className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                    ) : (
                        <button onClick={onResume} title="Resume" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-white/20 transition-colors`}>
                            <Play className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                    )}
                    {pomodoroEnabled && (
                        <button onClick={onSkip} title="Skip phase" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-white/20 transition-colors`}>
                            <SkipForward className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                    )}
                    <button onClick={onStop} title="Stop" className={`${isCompact ? 'p-1.5' : 'p-2'} rounded-full hover:bg-white/25 text-red-100 transition-colors`}>
                        <StopCircle className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                    </button>
                </div>
            )}
        </div>
    );
};
