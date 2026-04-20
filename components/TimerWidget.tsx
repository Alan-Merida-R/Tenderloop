
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

    // Per-second tick drives live re-computation of remaining time. Even when the
    // TimerProvider doesn't re-render (its state doesn't change while a phase is
    // running), this local tick keeps the display counting down.
    React.useEffect(() => {
        let interval: any;
        if (timerState.isRunning) {
            interval = setInterval(() => setTick(t => t + 1), 1000);
        } else {
            setTick(0);
        }
        return () => clearInterval(interval);
    }, [timerState.isRunning, timerState.taskId, timerState.pomodoroPhase]);

    const displaySeconds = React.useMemo(() => {
        if (!timerState.isRunning) return timerState.elapsedSeconds;
        const now = Date.now();
        const sessionSeconds = Math.floor((now - (timerState.startTime || now)) / 1000);
        return timerState.elapsedSeconds + sessionSeconds;
    }, [timerState.isRunning, timerState.elapsedSeconds, timerState.startTime, tick]);

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
        window.open(url, 'tenderloop_timer', 'width=320,height=240,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
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

    // Softer red for breaks — the previous rose-700 was too aggressive per user feedback.
    const bgClass = isBreak
        ? 'bg-rose-400/85 border-rose-200'
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

    const bg = isBreak
        ? 'bg-gradient-to-br from-rose-500/85 to-rose-400/80 text-white'
        : 'bg-gradient-to-br from-slate-900 to-slate-800 text-gray-100';

    return (
        <div className={`w-full h-full min-h-[220px] rounded-2xl ${bg} flex flex-col shadow-inner`}>
            <div className="px-4 pt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                <span>{pomodoroEnabled ? phaseLabel : 'Timer'}</span>
                <div className="flex items-center gap-1">
                    <button onClick={onOpenSettings} title="Pomodoro settings" className="p-1 rounded hover:bg-white/15 transition-colors">
                        <Settings className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-4">
                {hasSession ? (
                    <>
                        {/* Primary big readout: phase countdown in pomodoro mode, total elapsed otherwise */}
                        <div className="font-mono font-black tabular-nums leading-none tracking-tight"
                            style={{ fontSize: 'clamp(44px, 18vw, 84px)', textShadow: isBreak ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 12px rgba(61,205,88,0.35)' }}>
                            {pomodoroEnabled ? formatTime(phaseRemaining) : formatTime(displaySeconds)}
                        </div>
                        {pomodoroEnabled && (
                            <div className="mt-2 text-[11px] font-mono tabular-nums opacity-70">
                                preset {formatTime(phaseTargetSeconds)}
                            </div>
                        )}
                        {timerState.taskTitle && (
                            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70 truncate max-w-full text-center" title={timerState.taskTitle}>
                                {timerState.taskTitle}
                            </div>
                        )}
                    </>
                ) : (
                    <button onClick={onOpenStart} className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-bold flex items-center gap-2 transition-colors">
                        <Clock className="w-4 h-4" /> Start timer
                    </button>
                )}
            </div>

            {hasSession && (
                <div className="px-4 pb-3 flex items-center justify-center gap-1">
                    {timerState.isRunning ? (
                        <button onClick={onPause} title="Pause" className="p-2 rounded-full hover:bg-white/20 transition-colors">
                            <Pause className="w-5 h-5" />
                        </button>
                    ) : (
                        <button onClick={onResume} title="Resume" className="p-2 rounded-full hover:bg-white/20 transition-colors">
                            <Play className="w-5 h-5" />
                        </button>
                    )}
                    {pomodoroEnabled && (
                        <button onClick={onSkip} title="Skip phase" className="p-2 rounded-full hover:bg-white/20 transition-colors">
                            <SkipForward className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={onStop} title="Stop" className="p-2 rounded-full hover:bg-white/25 text-red-100 transition-colors">
                        <StopCircle className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
};
