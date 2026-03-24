import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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

export interface TimerContextType {
    timerState: TimerState;
    startTimer: (taskId: string, oppId: string, taskTitle: string) => void;
    pauseTimer: () => void;
    stopTimer: () => void; // Opens confirmation modal
    confirmStop: (status?: TaskStatus) => void; // Actually stops and logs
    logTime: (taskId: string, oppId: string, durationSeconds: number, status?: TaskStatus) => void;
    formatTime: (seconds: number) => string;
    openStartModal: () => void;
}

export interface TimerActionContextType {
    startTimer: (taskId: string, oppId: string, taskTitle: string) => void;
    pauseTimer: () => void;
    stopTimer: () => void; 
    confirmStop: (status?: TaskStatus) => void; 
    logTime: (taskId: string, oppId: string, durationSeconds: number, status?: TaskStatus) => void;
    formatTime: (seconds: number) => string;
    openStartModal: () => void;
    getTimerState: () => TimerState; // NEW: to avoid subscribing
}

export const TimerContext = createContext<TimerContextType | undefined>(undefined);
export const TimerActionContext = createContext<TimerActionContextType | undefined>(undefined);

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
    
    // Maintain a ref to the latest state to avoid recreating action callbacks
    const timerStateRef = useRef<TimerState>(timerState);
    useEffect(() => {
        timerStateRef.current = timerState;
    }, [timerState]);

    const onLogTimeRef = useRef(onLogTime);
    useEffect(() => {
        onLogTimeRef.current = onLogTime;
    }, [onLogTime]);

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

    const broadcastState = useCallback((state: TimerState) => {
        syncChannel.current?.postMessage({ type: 'TIMER_SYNC', state });
    }, []);

    const startTimer = useCallback((taskId: string, oppId: string, taskTitle: string) => {
        setTimerState(prev => {
            const newState: TimerState = {
                isRunning: true,
                taskId,
                oppId,
                taskTitle,
                startTime: Date.now(),
                elapsedSeconds: (prev.taskId === taskId ? prev.elapsedSeconds : 0)
            };
            broadcastState(newState);
            return newState;
        });
    }, [broadcastState]);

    const pauseTimer = useCallback(() => {
        setTimerState(prev => {
            if (!prev.isRunning) return prev;
            const now = Date.now();
            const additional = prev.startTime ? Math.floor((now - prev.startTime) / 1000) : 0;
            const newState: TimerState = {
                ...prev,
                isRunning: false,
                startTime: null,
                elapsedSeconds: prev.elapsedSeconds + additional
            };
            broadcastState(newState);
            return newState;
        });
    }, [broadcastState]);

    const stopTimer = useCallback(() => {
        setShowStopModal(true);
    }, []);

    const confirmStop = useCallback((status?: TaskStatus) => {
        const state = timerStateRef.current;
        const now = Date.now();
        const additional = (state.isRunning && state.startTime) ? Math.floor((now - state.startTime) / 1000) : 0;
        const total = state.elapsedSeconds + additional;

        // Always call onLogTime if we have a task and (time was logged OR status needs to change)
        if (state.taskId && state.oppId && (total > 0 || status)) {
            if (onLogTimeRef.current) onLogTimeRef.current(state.taskId, state.oppId, total, status);
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
    }, [broadcastState]);

    const formatTime = useCallback((seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const pad = (n: number) => n.toString().padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
        return `${m}:${pad(s)}`;
    }, []);

    const getTimerState = useCallback(() => timerStateRef.current, []);
    const logTimeProxy = useCallback((taskId: string, oppId: string, durationSeconds: number, status?: TaskStatus) => {
        if (onLogTimeRef.current) onLogTimeRef.current(taskId, oppId, durationSeconds, status);
    }, []);
    const openStartModal = useCallback(() => setShowModal(true), []);

    // Derived current elapsed for display
    const currentElapsed = timerState.isRunning && timerState.startTime
        ? timerState.elapsedSeconds + Math.floor((Date.now() - timerState.startTime) / 1000)
        : timerState.elapsedSeconds;

    const displayState = {
        ...timerState,
        elapsedSeconds: currentElapsed
    };

    const actions = React.useMemo(() => ({
        startTimer,
        pauseTimer,
        stopTimer,
        confirmStop,
        logTime: logTimeProxy,
        formatTime,
        openStartModal,
        getTimerState
    }), [startTimer, pauseTimer, stopTimer, confirmStop, logTimeProxy, formatTime, openStartModal, getTimerState]);

    return (
        <TimerActionContext.Provider value={actions}>
            <TimerContext.Provider value={{
                timerState: displayState,
                ...actions
            }}>
                {children}
            </TimerContext.Provider>
            
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
        </TimerActionContext.Provider>
    );
};

export const useTimer = () => {
    const context = useContext(TimerContext);
    if (!context) throw new Error("useTimer must be used within a TimerProvider");
    return context;
};

export const useTimerActions = () => {
    const context = useContext(TimerActionContext);
    if (!context) throw new Error("useTimerActions must be used within a TimerProvider");
    return context;
};
