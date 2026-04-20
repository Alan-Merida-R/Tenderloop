
import React from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause, StopCircle, Clock, Settings, SkipForward, ExternalLink } from 'lucide-react';

export const TimerWidget = ({ onTaskClick }: { onTaskClick?: (taskId: string, oppId: string) => void }) => {
    const {
        timerState, startTimer, pauseTimer, stopTimer, formatTime, openStartModal,
        pomodoroConfig, phaseTargetSeconds, phaseElapsedSeconds,
        skipPomodoroPhase, openPomodoroSettings,
    } = useTimer();
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        let interval: any;
        if (timerState.isRunning) {
            interval = setInterval(() => setTick(t => t + 1), 1000);
        } else {
            setTick(0);
        }
        return () => clearInterval(interval);
    }, [timerState.isRunning, timerState.taskId]);

    const displaySeconds = React.useMemo(() => {
        if (!timerState.isRunning) return timerState.elapsedSeconds;
        const now = Date.now();
        const sessionSeconds = Math.floor((now - (timerState.startTime || now)) / 1000);
        return timerState.elapsedSeconds + sessionSeconds;
    }, [timerState.isRunning, timerState.elapsedSeconds, timerState.startTime, tick]);

    const isBreak = pomodoroConfig.enabled && timerState.pomodoroPhase !== 'work';
    const phaseLabel = timerState.pomodoroPhase === 'work'
        ? 'Focus'
        : timerState.pomodoroPhase === 'shortBreak' ? 'Short Break' : 'Long Break';
    const phaseRemaining = Math.max(0, phaseTargetSeconds - phaseElapsedSeconds);

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

    const popOut = React.useCallback(() => {
        const url = `${window.location.pathname}?window=timer`;
        window.open(url, 'tenderloop_timer', 'width=360,height=220,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
    }, []);

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

    const bgClass = isBreak
        ? 'bg-rose-700/95 border-rose-400'
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
                <span className="text-xl font-mono font-bold leading-none">
                    {pomodoroConfig.enabled
                        ? formatTime(phaseRemaining)
                        : formatTime(displaySeconds)}
                </span>
                {pomodoroConfig.enabled && (
                    <span className="text-[9px] opacity-60 mt-0.5">
                        Total work: {formatTime(displaySeconds)}
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
