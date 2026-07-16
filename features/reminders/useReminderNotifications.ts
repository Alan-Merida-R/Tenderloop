import { useEffect, useRef } from 'react';
import { Reminder } from '../../types';
import { playSound } from '../../services/soundService';
import type { SoundType } from '../../components/SettingsModal';

// Poll every 30s — cheap and matches the schedule-notifications cadence.
const CHECK_INTERVAL_MS = 30_000;

interface OpenReminderFn {
    (oppId: string, taskId?: string, noteId?: string): void;
}

/**
 * Browser notification scheduler for user-created reminders.
 * Fires a notification once a reminder's dueAt is reached, and marks it
 * `notifiedAt` so it never fires twice. The bell badge count is computed
 * live from `dueAt <= now && !seenAt`, independent of this hook — so a
 * missed/denied Notification never hides a due reminder from the badge.
 */
export const useReminderNotifications = (
    reminders: Reminder[],
    onNotified: (id: string) => void,
    openReminder: OpenReminderFn,
    notificationSound?: SoundType,
    enabled?: boolean,
) => {
    const remindersRef = useRef(reminders);
    const onNotifiedRef = useRef(onNotified);
    const openRef = useRef(openReminder);
    const soundRef = useRef<SoundType | undefined>(notificationSound);

    useEffect(() => { remindersRef.current = reminders; }, [reminders]);
    useEffect(() => { onNotifiedRef.current = onNotified; }, [onNotified]);
    useEffect(() => { openRef.current = openReminder; }, [openReminder]);
    useEffect(() => { soundRef.current = notificationSound; }, [notificationSound]);

    useEffect(() => {
        if (!enabled) return;
        if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { /* ignored */ });
        }

        const check = () => {
            if (Notification.permission !== 'granted') return;
            const now = Date.now();

            for (const reminder of remindersRef.current) {
                if (reminder.notifiedAt || reminder.seenAt) continue;
                const due = new Date(reminder.dueAt).getTime();
                if (isNaN(due) || due > now) continue;

                onNotifiedRef.current(reminder.id);
                try {
                    const n = new Notification(reminder.title, {
                        body: reminder.taskId || reminder.noteId ? 'Linked to this opportunity' : undefined,
                        tag: reminder.id,
                        requireInteraction: true,
                    });
                    n.onclick = () => {
                        try { window.focus(); } catch { /* ignored */ }
                        openRef.current(reminder.opportunityId, reminder.taskId, reminder.noteId);
                        n.close();
                    };
                    playSound(soundRef.current || 'ding');
                } catch { /* notification constructor can throw on iOS Safari */ }
            }
        };

        check();
        const id = window.setInterval(check, CHECK_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [enabled]);
};
