
import React from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause, StopCircle, Clock } from 'lucide-react';

export const TimerWidget = ({ onTaskClick }: { onTaskClick?: (taskId: string, oppId: string) => void }) => {
    const { timerState, startTimer, pauseTimer, stopTimer, formatTime, openStartModal } = useTimer();
    const [tick, setTick] = React.useState(0);

    // Local tick for display
    React.useEffect(() => {
        let interval: any;
        if (timerState.isRunning) {
            interval = setInterval(() => {
                setTick(t => t + 1);
            }, 1000);
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

    React.useEffect(() => {
        if (timerState.isRunning) {
            document.title = `[${formatTime(displaySeconds)}] ${timerState.taskTitle || 'Timer'} | TenderLoop`;
        } else {
            document.title = 'TenderLoop';
        }
    }, [displaySeconds, timerState.isRunning, timerState.taskTitle]);

    if (!timerState.isRunning && timerState.elapsedSeconds === 0) {
        return (
            <div className="fixed bottom-4 right-4 z-[100] animate-in fade-in zoom-in duration-300">
                <button
                    onClick={openStartModal}
                    className="bg-gray-900/90 text-white p-3 rounded-full shadow-xl hover:scale-110 transition-transform border border-gray-700 group flex items-center gap-2"
                    title="Start Timer"
                >
                    <Clock className="w-5 h-5 text-[#3DCD58]" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 text-xs font-bold whitespace-nowrap">Timer Ready</span>
                </button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 bg-gray-900/90 backdrop-blur-md text-white p-3 rounded-full flex items-center gap-4 shadow-2xl z-[100] animate-slide-in-up border border-gray-700 transition-all hover:scale-105">
            <div className="flex flex-col">
                <button
                    onClick={() => timerState.taskId && onTaskClick?.(timerState.taskId, timerState.oppId!)}
                    className="text-[10px] text-gray-400 font-bold uppercase tracking-wider max-w-[150px] truncate hover:text-[#3DCD58] transition-colors text-left focus:outline-none"
                    title="View Task Details"
                >
                    {timerState.taskTitle || 'No Task'}
                </button>
                <span className="text-xl font-mono font-bold leading-none">{formatTime(displaySeconds)}</span>
            </div>

            <div className="flex items-center gap-1">
                {timerState.isRunning ? (
                    <button onClick={pauseTimer} className="p-2 hover:bg-gray-700 rounded-full transition-colors"><Pause className="w-5 h-5" /></button>
                ) : (
                    <button onClick={() => startTimer(timerState.taskId!, timerState.oppId!, timerState.taskTitle!)} className="p-2 hover:bg-gray-700 rounded-full transition-colors"><Play className="w-5 h-5" /></button>
                )}
                <button
                    onClick={stopTimer}
                    className="p-2 hover:bg-red-900/50 text-red-500 rounded-full transition-colors"
                >
                    <StopCircle className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};
