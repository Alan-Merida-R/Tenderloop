import { useEffect, useRef } from 'react';
import { Opportunity, DeepLink } from '../../types';
import { timeToMinutes } from './executionBlockUtils';

// Lead time shortened per user request: notify 5 minutes before the block starts.
const LEAD_MINUTES = 5;
// Poll every 30s so the 2-minute firing window can't be missed by a user whose
// machine was briefly asleep at the top of the minute.
const CHECK_INTERVAL_MS = 30_000;
// Bumped to V2 because the previous seen-keys used 10-minute semantics; if a user
// upgrades while a block is already within 5-10 min, we don't want stale keys to
// suppress the new 5-min notification.
const STORAGE_KEY = 'TenderLoop_NotifiedBlocks_V2';

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
                        // Fire once while delta is in [LEAD-2, LEAD]. With LEAD=5 that gives
                        // a 3..5 min firing window, wide enough to catch any missed tick.
                        if (delta <= LEAD_MINUTES && delta > LEAD_MINUTES - 3) {
                            const key = `${block.id}-${block.date}`;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            try {
                                const oppLabel = opp.alias || opp.title;
                                const n = new Notification(
                                    `Starts in ${LEAD_MINUTES} min — ${task.title}`,
                                    {
                                        body: `${oppLabel}\n${block.startTime}–${block.endTime}`,
                                        tag: key,
                                        requireInteraction: true,
                                    }
                                );
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
