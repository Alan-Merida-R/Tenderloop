
import React from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Play, Pause, StopCircle, Clock } from 'lucide-react';

export const TimerWidget = () => {
    const { timerState, startTimer, pauseTimer, stopTimer, formatTime, openStartModal } = useTimer();

    React.useEffect(() => {
        if (timerState.isRunning) {
            document.title = `[${formatTime(timerState.elapsedSeconds)}] ${timerState.taskTitle || 'Timer'} | TenderLoop`;
        } else {
            document.title = 'TenderLoop';
        }
    }, [timerState.elapsedSeconds, timerState.isRunning, timerState.taskTitle]);

    if (!timerState.isRunning && timerState.elapsedSeconds === 0) {
        return (
            <div className="fixed bottom-4 right-4 z-[100] animate-in fade-in zoom-in duration-300">
                <button
                    onClick={openStartModal} // Open global modal
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
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider max-w-[150px] truncate">{timerState.taskTitle || 'No Task'}</span>
                <span className="text-xl font-mono font-bold leading-none">{formatTime(timerState.elapsedSeconds)}</span>
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
