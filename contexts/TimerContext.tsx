import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Opportunity } from '../types';
import { StartTimerModal } from '../components/StartTimerModal';
import { StopTimerModal } from '../components/StopTimerModal';
import { TaskStatus } from '../types';

// Timer State Interface
interface TimerState {
    isRunning: boolean;
    taskId: string | null;
    oppId: string | null;
    taskTitle: string | null;
    startTime: number | null; // Timestamp when current run started
    elapsedSeconds: number;   // Total accumulated seconds before current run
}

interface TimerContextType {
    timerState: TimerState;
    startTimer: (taskId: string, oppId: string, taskTitle: string) => void;
    pauseTimer: () => void;
    stopTimer: () => void; // Opens confirmation modal
    confirmStop: (status?: TaskStatus) => void; // Actually stops and logs
    logTime: (taskId: string, oppId: string, durationSeconds: number, status?: TaskStatus) => void;
    formatTime: (seconds: number) => string;
    openStartModal: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

const STORAGE_KEY = 'tenderloop_timer_state';

interface TimerProviderProps {
    children: React.ReactNode;
    onLogTime?: (taskId: string, oppId: string, seconds: number, status?: TaskStatus) => void;
    opportunities: Opportunity[];
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children, onLogTime, opportunities }) => {
    const [timerState, setTimerState] = useState<TimerState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return {
            isRunning: false,
            taskId: null,
            oppId: null,
            taskTitle: null,
            startTime: null,
            elapsedSeconds: 0
        };
    });

    const [showModal, setShowModal] = useState(false);
    const [showStopModal, setShowStopModal] = useState(false);
    const intervalRef = useRef<number | null>(null);

    // Persistence
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    }, [timerState]);

    // Cross-tab Sync
    const syncChannel = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        syncChannel.current = new BroadcastChannel('tenderloop_timer_sync');
        syncChannel.current.onmessage = (event) => {
            if (event.data.type === 'TIMER_SYNC') {
                setTimerState(event.data.state);
            }
        };
        return () => syncChannel.current?.close();
    }, []);

    const broadcastState = (state: TimerState) => {
        syncChannel.current?.postMessage({ type: 'TIMER_SYNC', state });
    };

    // Timer Persistence only on changes (isRunning, taskId, etc)
    // We REMOVE the 1s tick to avoid app-wide re-renders. 
    // Individual widgets can implement local ticking.
    useEffect(() => {
        if (timerState.isRunning) {
            // No interval needed here anymore
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
    }, [timerState.isRunning]);

    const startTimer = (taskId: string, oppId: string, taskTitle: string) => {
        const newState: TimerState = {
            isRunning: true,
            taskId,
            oppId,
            taskTitle,
            startTime: Date.now(),
            elapsedSeconds: (timerState.taskId === taskId ? timerState.elapsedSeconds : 0)
        };
        setTimerState(newState);
        broadcastState(newState);
    };

    const pauseTimer = () => {
        const now = Date.now();
        const additional = timerState.startTime ? Math.floor((now - timerState.startTime) / 1000) : 0;
        const newState: TimerState = {
            ...timerState,
            isRunning: false,
            startTime: null,
            elapsedSeconds: timerState.elapsedSeconds + additional
        };
        setTimerState(newState);
        broadcastState(newState);
    };

    const stopTimer = () => {
        setShowStopModal(true);
    };

    const confirmStop = (status?: TaskStatus) => {
        const now = Date.now();
        const additional = (timerState.isRunning && timerState.startTime) ? Math.floor((now - timerState.startTime) / 1000) : 0;
        const total = timerState.elapsedSeconds + additional;

        if (total > 0 && timerState.taskId && timerState.oppId) {
            if (onLogTime) onLogTime(timerState.taskId, timerState.oppId, total, status);
        }

        const resetState: TimerState = {
            isRunning: false,
            taskId: null,
            oppId: null,
            taskTitle: null,
            startTime: null,
            elapsedSeconds: 0
        };
        setTimerState(resetState);
        broadcastState(resetState);
        setShowStopModal(false);
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const pad = (n: number) => n.toString().padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
        return `${m}:${pad(s)}`;
    };

    // Derived current elapsed for display
    const currentElapsed = timerState.isRunning && timerState.startTime
        ? timerState.elapsedSeconds + Math.floor((Date.now() - timerState.startTime) / 1000)
        : timerState.elapsedSeconds;

    const displayState = {
        ...timerState,
        elapsedSeconds: currentElapsed
    };

    return (
        <TimerContext.Provider value={{
            timerState: displayState,
            startTimer,
            pauseTimer,
            stopTimer,
            confirmStop,
            logTime: onLogTime || (() => { }),
            formatTime,
            openStartModal: () => setShowModal(true)
        }}>
            {children}
            <StartTimerModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                opportunities={opportunities}
                onStart={startTimer}
            />
            <StopTimerModal
                isOpen={showStopModal}
                onClose={() => setShowStopModal(false)}
                taskTitle={displayState.taskTitle || 'Current Task'}
                elapsedTime={formatTime(displayState.elapsedSeconds)}
                onConfirm={confirmStop}
            />
        </TimerContext.Provider>
    );
};

export const useTimer = () => {
    const context = useContext(TimerContext);
    if (!context) throw new Error("useTimer must be used within a TimerProvider");
    return context;
};
