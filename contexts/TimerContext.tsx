import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Opportunity } from '../types';
import { StartTimerModal } from '../components/StartTimerModal';
import { StopTimerModal } from '../components/StopTimerModal';
import { TaskStatus } from '../types';

export type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';

export interface PomodoroConfig {
    workMin: number;
    shortBreakMin: number;
    longBreakMin: number;
    cyclesBeforeLongBreak: number;
    enabled: boolean;
    soundEnabled: boolean;
    autoStartNextPhase: boolean;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
    workMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    cyclesBeforeLongBreak: 4,
    enabled: false,
    soundEnabled: true,
    autoStartNextPhase: true,
};

interface TimerState {
    isRunning: boolean;
    taskId: string | null;
    oppId: string | null;
    taskTitle: string | null;
    startTime: number | null;   // ms epoch when current run started
    elapsedSeconds: number;     // total accumulated seconds before current run (work only)
    pomodoroPhase: PomodoroPhase;
    pomodoroCycleIndex: number; // completed work cycles this session
    pomodoroPhaseStart: number | null; // ms epoch when current phase started (running or paused)
    pomodoroPhaseAccumulated: number;  // accumulated seconds within the current phase
}

export interface TimerContextType {
    timerState: TimerState;
    pomodoroConfig: PomodoroConfig;
    setPomodoroConfig: (cfg: PomodoroConfig) => void;
    startTimer: (taskId: string, oppId: string, taskTitle: string) => void;
    pauseTimer: () => void;
    stopTimer: () => void;
    confirmStop: (status?: TaskStatus) => void;
    logTime: (taskId: string, oppId: string, durationSeconds: number, status?: TaskStatus) => void;
    formatTime: (seconds: number) => string;
    openStartModal: () => void;
    skipPomodoroPhase: () => void;
    openPomodoroSettings: () => void;
    phaseTargetSeconds: number;
    phaseElapsedSeconds: number;
}

export interface TimerActionContextType {
    startTimer: (taskId: string, oppId: string, taskTitle: string) => void;
    pauseTimer: () => void;
    stopTimer: () => void;
    confirmStop: (status?: TaskStatus) => void;
    logTime: (taskId: string, oppId: string, durationSeconds: number, status?: TaskStatus) => void;
    formatTime: (seconds: number) => string;
    openStartModal: () => void;
    getTimerState: () => TimerState;
    skipPomodoroPhase: () => void;
    openPomodoroSettings: () => void;
}

export const TimerContext = createContext<TimerContextType | undefined>(undefined);
export const TimerActionContext = createContext<TimerActionContextType | undefined>(undefined);

const STORAGE_KEY = 'tenderloop_timer_state';
const POMO_CONFIG_KEY = 'tenderloop_pomodoro_config';

const DEFAULT_STATE: TimerState = {
    isRunning: false,
    taskId: null,
    oppId: null,
    taskTitle: null,
    startTime: null,
    elapsedSeconds: 0,
    pomodoroPhase: 'work',
    pomodoroCycleIndex: 0,
    pomodoroPhaseStart: null,
    pomodoroPhaseAccumulated: 0,
};

interface TimerProviderProps {
    children: React.ReactNode;
    onLogTime?: (taskId: string, oppId: string, seconds: number, status?: TaskStatus) => void;
    opportunities: Opportunity[];
}

/** Short beep via WebAudio; tolerates browsers that block autoplay. */
const playBeep = (durationMs = 220, frequency = 880, volume = 0.15) => {
    try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = frequency;
        osc.type = 'sine';
        gain.gain.value = volume;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => {
            try { osc.stop(); ctx.close(); } catch { /* ignore */ }
        }, durationMs);
    } catch { /* ignored */ }
};

const playPhaseAlert = (phase: PomodoroPhase) => {
    if (phase === 'work') {
        playBeep(180, 660);
        setTimeout(() => playBeep(180, 880), 220);
    } else {
        playBeep(260, 523);
        setTimeout(() => playBeep(260, 659), 300);
    }
};

const fireBrowserNotification = (title: string, body: string, tag = 'pomodoro-phase') => {
    try {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'granted') {
            // `tag` ensures the same topic (phase, start, stop) replaces its own previous
            // notification instead of stacking in the tray.
            new Notification(title, { body, tag, requireInteraction: false });
        }
    } catch { /* ignored */ }
};

const ensureNotificationPermission = () => {
    try {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { /* ignore */ });
        }
    } catch { /* ignored */ }
};

const phaseSeconds = (phase: PomodoroPhase, cfg: PomodoroConfig) => {
    if (phase === 'work') return cfg.workMin * 60;
    if (phase === 'shortBreak') return cfg.shortBreakMin * 60;
    return cfg.longBreakMin * 60;
};

const phaseLabel = (phase: PomodoroPhase) => {
    if (phase === 'work') return 'Focus';
    if (phase === 'shortBreak') return 'Short Break';
    return 'Long Break';
};

export const TimerProvider: React.FC<TimerProviderProps> = ({ children, onLogTime, opportunities }) => {
    const [timerState, setTimerState] = useState<TimerState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return { ...DEFAULT_STATE, ...JSON.parse(saved) };
        } catch (e) { }
        return DEFAULT_STATE;
    });

    const [pomodoroConfig, setPomodoroConfigState] = useState<PomodoroConfig>(() => {
        try {
            const saved = localStorage.getItem(POMO_CONFIG_KEY);
            if (saved) return { ...DEFAULT_POMODORO_CONFIG, ...JSON.parse(saved) };
        } catch (e) { }
        return DEFAULT_POMODORO_CONFIG;
    });

    const [showModal, setShowModal] = useState(false);
    const [showStopModal, setShowStopModal] = useState(false);
    const [showPomodoroSettings, setShowPomodoroSettings] = useState(false);

    const timerStateRef = useRef<TimerState>(timerState);
    useEffect(() => { timerStateRef.current = timerState; }, [timerState]);

    const pomodoroConfigRef = useRef<PomodoroConfig>(pomodoroConfig);
    useEffect(() => { pomodoroConfigRef.current = pomodoroConfig; }, [pomodoroConfig]);

    const onLogTimeRef = useRef(onLogTime);
    useEffect(() => { onLogTimeRef.current = onLogTime; }, [onLogTime]);

    // Persistence
    useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState)); }, [timerState]);
    useEffect(() => { localStorage.setItem(POMO_CONFIG_KEY, JSON.stringify(pomodoroConfig)); }, [pomodoroConfig]);

    // Cross-tab sync
    const syncChannel = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        syncChannel.current = new BroadcastChannel('tenderloop_timer_sync');
        syncChannel.current.onmessage = (event) => {
            if (event.data.type === 'TIMER_SYNC') setTimerState(event.data.state);
            else if (event.data.type === 'POMO_CONFIG_SYNC') setPomodoroConfigState(event.data.config);
        };
        return () => syncChannel.current?.close();
    }, []);

    const broadcastState = useCallback((state: TimerState) => {
        syncChannel.current?.postMessage({ type: 'TIMER_SYNC', state });
    }, []);
    const broadcastConfig = useCallback((cfg: PomodoroConfig) => {
        syncChannel.current?.postMessage({ type: 'POMO_CONFIG_SYNC', config: cfg });
    }, []);

    const setPomodoroConfig = useCallback((cfg: PomodoroConfig) => {
        setPomodoroConfigState(cfg);
        broadcastConfig(cfg);
    }, [broadcastConfig]);

    const startTimer = useCallback((taskId: string, oppId: string, taskTitle: string) => {
        ensureNotificationPermission();
        setTimerState(prev => {
            const now = Date.now();
            const sameTask = prev.taskId === taskId;
            const newState: TimerState = {
                isRunning: true,
                taskId,
                oppId,
                taskTitle,
                startTime: now,
                elapsedSeconds: sameTask ? prev.elapsedSeconds : 0,
                pomodoroPhase: sameTask ? prev.pomodoroPhase : 'work',
                pomodoroCycleIndex: sameTask ? prev.pomodoroCycleIndex : 0,
                pomodoroPhaseStart: now,
                pomodoroPhaseAccumulated: sameTask ? prev.pomodoroPhaseAccumulated : 0,
            };
            const resumed = sameTask && prev.pomodoroPhaseAccumulated > 0;
            fireBrowserNotification(
                resumed ? 'Timer resumed' : 'Timer started',
                taskTitle,
                'timer-session'
            );
            broadcastState(newState);
            return newState;
        });
    }, [broadcastState]);

    const pauseTimer = useCallback(() => {
        setTimerState(prev => {
            if (!prev.isRunning) return prev;
            const now = Date.now();
            const additional = prev.startTime ? Math.floor((now - prev.startTime) / 1000) : 0;
            const phaseAdditional = prev.pomodoroPhaseStart ? Math.floor((now - prev.pomodoroPhaseStart) / 1000) : 0;
            const newState: TimerState = {
                ...prev,
                isRunning: false,
                startTime: null,
                pomodoroPhaseStart: null,
                elapsedSeconds: prev.pomodoroPhase === 'work' ? prev.elapsedSeconds + additional : prev.elapsedSeconds,
                pomodoroPhaseAccumulated: prev.pomodoroPhaseAccumulated + phaseAdditional,
            };
            broadcastState(newState);
            return newState;
        });
    }, [broadcastState]);

    const stopTimer = useCallback(() => { setShowStopModal(true); }, []);

    const confirmStop = useCallback((status?: TaskStatus) => {
        const state = timerStateRef.current;
        const now = Date.now();
        const additional = (state.isRunning && state.startTime && state.pomodoroPhase === 'work') ? Math.floor((now - state.startTime) / 1000) : 0;
        const total = state.elapsedSeconds + additional;

        if (state.taskId && state.oppId && (total > 0 || status)) {
            if (onLogTimeRef.current) onLogTimeRef.current(state.taskId, state.oppId, total, status);
        }

        if (state.taskTitle) {
            const statusLabel = status ? ` — ${status}` : '';
            fireBrowserNotification(
                'Timer stopped',
                `${state.taskTitle}${statusLabel}`,
                'timer-session'
            );
        }

        setTimerState(DEFAULT_STATE);
        broadcastState(DEFAULT_STATE);
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
    const openPomodoroSettings = useCallback(() => setShowPomodoroSettings(true), []);

    // Phase transition (manual skip or auto at target reached)
    const advancePhase = useCallback((manualSkip = false) => {
        setTimerState(prev => {
            const cfg = pomodoroConfigRef.current;
            const now = Date.now();
            const running = prev.isRunning;
            let nextPhase: PomodoroPhase;
            let nextCycleIndex = prev.pomodoroCycleIndex;
            if (prev.pomodoroPhase === 'work') {
                nextCycleIndex = prev.pomodoroCycleIndex + 1;
                nextPhase = (nextCycleIndex % cfg.cyclesBeforeLongBreak === 0) ? 'longBreak' : 'shortBreak';
            } else {
                nextPhase = 'work';
            }

            // If we completed a work phase (non-manual), log accumulated work seconds.
            if (!manualSkip && prev.pomodoroPhase === 'work' && prev.taskId && prev.oppId) {
                const workElapsed = prev.pomodoroPhaseAccumulated + (prev.pomodoroPhaseStart && running ? Math.floor((now - prev.pomodoroPhaseStart) / 1000) : 0);
                if (workElapsed > 0 && onLogTimeRef.current) {
                    onLogTimeRef.current(prev.taskId, prev.oppId, workElapsed);
                }
            }

            const autoStart = cfg.autoStartNextPhase && running;
            const newState: TimerState = {
                ...prev,
                pomodoroPhase: nextPhase,
                pomodoroCycleIndex: nextCycleIndex,
                pomodoroPhaseStart: autoStart ? now : null,
                pomodoroPhaseAccumulated: 0,
                isRunning: autoStart,
                startTime: autoStart && nextPhase === 'work' ? now : (nextPhase !== 'work' ? null : prev.startTime),
                // Reset work-elapsed when starting a fresh work phase after a break completion
                elapsedSeconds: nextPhase === 'work' ? 0 : prev.elapsedSeconds,
            };
            if (!manualSkip) {
                if (cfg.soundEnabled) playPhaseAlert(nextPhase);
                fireBrowserNotification(
                    nextPhase === 'work' ? 'Back to work' : 'Break time',
                    `${phaseLabel(nextPhase)} — ${phaseSeconds(nextPhase, cfg) / 60} min`
                );
            }
            broadcastState(newState);
            return newState;
        });
    }, [broadcastState]);

    const skipPomodoroPhase = useCallback(() => advancePhase(true), [advancePhase]);

    // Auto phase-complete watcher: ticks every second while running + pomodoro enabled
    useEffect(() => {
        if (!pomodoroConfig.enabled) return;
        if (!timerState.isRunning) return;
        const id = window.setInterval(() => {
            const s = timerStateRef.current;
            const cfg = pomodoroConfigRef.current;
            if (!s.isRunning || !cfg.enabled) return;
            const now = Date.now();
            const active = s.pomodoroPhaseStart ? Math.floor((now - s.pomodoroPhaseStart) / 1000) : 0;
            const elapsed = s.pomodoroPhaseAccumulated + active;
            if (elapsed >= phaseSeconds(s.pomodoroPhase, cfg)) {
                advancePhase(false);
            }
        }, 1000);
        return () => window.clearInterval(id);
    }, [timerState.isRunning, pomodoroConfig.enabled, advancePhase]);

    // Derived displays
    const currentWorkElapsed = timerState.isRunning && timerState.startTime && timerState.pomodoroPhase === 'work'
        ? timerState.elapsedSeconds + Math.floor((Date.now() - timerState.startTime) / 1000)
        : timerState.elapsedSeconds;

    const phaseElapsedSeconds = timerState.isRunning && timerState.pomodoroPhaseStart
        ? timerState.pomodoroPhaseAccumulated + Math.floor((Date.now() - timerState.pomodoroPhaseStart) / 1000)
        : timerState.pomodoroPhaseAccumulated;

    const phaseTargetSeconds = phaseSeconds(timerState.pomodoroPhase, pomodoroConfig);

    const displayState = {
        ...timerState,
        elapsedSeconds: currentWorkElapsed,
    };

    const actions = React.useMemo(() => ({
        startTimer,
        pauseTimer,
        stopTimer,
        confirmStop,
        logTime: logTimeProxy,
        formatTime,
        openStartModal,
        getTimerState,
        skipPomodoroPhase,
        openPomodoroSettings,
    }), [startTimer, pauseTimer, stopTimer, confirmStop, logTimeProxy, formatTime, openStartModal, getTimerState, skipPomodoroPhase, openPomodoroSettings]);

    return (
        <TimerActionContext.Provider value={actions}>
            <TimerContext.Provider value={{
                timerState: displayState,
                pomodoroConfig,
                setPomodoroConfig,
                phaseTargetSeconds,
                phaseElapsedSeconds,
                ...actions,
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
            <PomodoroSettingsModal
                isOpen={showPomodoroSettings}
                onClose={() => setShowPomodoroSettings(false)}
                config={pomodoroConfig}
                onSave={setPomodoroConfig}
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

// --- Inline Pomodoro settings modal (kept here to avoid extra file plumbing) ---

interface PomodoroSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    config: PomodoroConfig;
    onSave: (cfg: PomodoroConfig) => void;
}

const PomodoroSettingsModal: React.FC<PomodoroSettingsProps> = ({ isOpen, onClose, config, onSave }) => {
    const [draft, setDraft] = useState<PomodoroConfig>(config);
    useEffect(() => { if (isOpen) setDraft(config); }, [isOpen, config]);
    if (!isOpen) return null;

    const handleSave = () => {
        // Request notification permission if user is enabling pomodoro for the first time
        if (draft.enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { /* ignore */ });
        }
        onSave(draft);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-gray-800">Pomodoro Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
                </div>

                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}
                        className="accent-[#3DCD58] w-4 h-4"
                    />
                    <span className="text-sm font-bold text-gray-800">Enable Pomodoro mode</span>
                </label>
                <p className="text-[11px] text-gray-400 mb-4 -mt-2">Optional. When off, the timer runs as a simple stopwatch.</p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <NumField label="Focus (min)" value={draft.workMin} min={1} max={120} onChange={v => setDraft(d => ({ ...d, workMin: v }))} />
                    <NumField label="Short break (min)" value={draft.shortBreakMin} min={1} max={60} onChange={v => setDraft(d => ({ ...d, shortBreakMin: v }))} />
                    <NumField label="Long break (min)" value={draft.longBreakMin} min={1} max={120} onChange={v => setDraft(d => ({ ...d, longBreakMin: v }))} />
                    <NumField label="Cycles before long" value={draft.cyclesBeforeLongBreak} min={1} max={10} onChange={v => setDraft(d => ({ ...d, cyclesBeforeLongBreak: v }))} />
                </div>

                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={draft.soundEnabled}
                        onChange={e => setDraft(d => ({ ...d, soundEnabled: e.target.checked }))}
                        className="accent-[#3DCD58] w-4 h-4"
                    />
                    <span className="text-xs text-gray-700">Play sound on phase change</span>
                </label>
                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={draft.autoStartNextPhase}
                        onChange={e => setDraft(d => ({ ...d, autoStartNextPhase: e.target.checked }))}
                        className="accent-[#3DCD58] w-4 h-4"
                    />
                    <span className="text-xs text-gray-700">Auto-start next phase</span>
                </label>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-1.5 text-xs font-black uppercase tracking-widest bg-[#3DCD58] text-white rounded hover:brightness-110">Save</button>
                </div>
            </div>
        </div>
    );
};

const NumField: React.FC<{ label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }>
    = ({ label, value, min, max, onChange }) => (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</span>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                onChange={e => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) onChange(Math.max(min ?? 1, Math.min(max ?? 999, n)));
                }}
                className="px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
            />
        </label>
    );
