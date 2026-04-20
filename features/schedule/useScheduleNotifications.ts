import { useEffect, useRef } from 'react';
import { Opportunity, DeepLink } from '../../types';
import { timeToMinutes } from './executionBlockUtils';

const LEAD_MINUTES = 10;
const CHECK_INTERVAL_MS = 60_000;
const STORAGE_KEY = 'TenderLoop_NotifiedBlocks_V1';

/** Stored notified-block keys: `${blockId}-YYYY-MM-DD`. Trimmed daily. */
const loadSeen = (): Set<string> => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw));
    } catch {
        return new Set();
    }
};

const saveSeen = (seen: Set<string>) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
    } catch { /* storage full — skip */ }
};

interface OpenTaskFn {
    (oppId: string, dl: DeepLink): void;
}

/**
 * Browser notification scheduler for upcoming ExecutionBlocks.
 * Fires a notification 10 minutes before a block's start time.
 * Click opens the opportunity with a deep link focusing the task.
 * Notifications are deduped per (blockId, date) so they fire at most once.
 * Notifications are skipped silently if permission is denied.
 */
export const useScheduleNotifications = (opportunities: Opportunity[], openTask: OpenTaskFn) => {
    const oppsRef = useRef(opportunities);
    const openRef = useRef(openTask);

    useEffect(() => { oppsRef.current = opportunities; }, [opportunities]);
    useEffect(() => { openRef.current = openTask; }, [openTask]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

        // Request permission lazily once per session
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { /* ignored */ });
        }

        const check = () => {
            if (Notification.permission !== 'granted') return;
            const seen = loadSeen();
            const now = new Date();
            const todayStr = now.toLocaleDateString('en-CA');
            const nowMin = now.getHours() * 60 + now.getMinutes();

            // Trim stale keys for days other than today (cheap bound on growth)
            for (const key of [...seen]) {
                if (!key.endsWith(`-${todayStr}`)) seen.delete(key);
            }

            for (const opp of oppsRef.current) {
                for (const task of opp.tasks || []) {
                    if (task.status === 'Done' || task.status === 'Canceled') continue;
                    for (const block of task.executionBlocks || []) {
                        if (block.date !== todayStr) continue;
                        const startMin = timeToMinutes(block.startTime);
                        if (isNaN(startMin)) continue;
                        const delta = startMin - nowMin;
                        if (delta <= LEAD_MINUTES && delta > LEAD_MINUTES - 2) {
                            const key = `${block.id}-${block.date}`;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            try {
                                const n = new Notification(`Starting in ${delta} min`, {
                                    body: `${task.title}\n${opp.alias || opp.title} · ${block.startTime}–${block.endTime}`,
                                    tag: key,
                                    requireInteraction: false,
                                });
                                n.onclick = () => {
                                    try { window.focus(); } catch { /* ignored */ }
                                    openRef.current(opp.id, { tab: 'tasks', taskId: task.id, fullView: true });
                                    n.close();
                                };
                            } catch { /* notification constructor can throw on iOS Safari */ }
                        }
                    }
                }
            }
            saveSeen(seen);
        };

        check();
        const id = window.setInterval(check, CHECK_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, []);
};
