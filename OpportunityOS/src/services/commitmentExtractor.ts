/**
 * [TA6 / audit C4, B-G1, error A2] Fixed commitments, read out of what the user already writes.
 *
 * The audit's second-worst error was scheduling work on top of a 12:00 meeting. The meeting was in
 * the payload — as prose, inside a note ("mañana junta a las 12, como 1 hora"), inside a history
 * event, or as a reminder with an exact time — but never as a constraint the scheduler could
 * subtract from capacity.
 *
 * This module turns that prose into structured commitments. It is deliberately NOT AI and
 * deliberately conservative:
 *   - a line must name a meeting-like event AND carry a time before it counts;
 *   - a commitment is read-only context that consumes capacity, never something written back;
 *   - every detection carries the sentence it came from, so the user can see what was matched and
 *     untick a wrong one before the prompt is generated.
 * Being wrong here costs the user an hour of misplanned day, so a missed meeting is preferable to
 * an invented one, and the patterns are tuned in that direction.
 */

import { MeetingNote, Opportunity, Reminder } from '../types';

export interface FixedCommitment {
    /** Stable within one extraction run, used as the React key and the untick key. */
    id: string;
    date: string;      // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string;   // HH:mm
    title: string;
    /** Where it was found, shown to the user so a wrong match is obvious. */
    source: 'note' | 'history' | 'reminder';
    sourceLabel: string;
    /** The exact sentence the commitment was read from. */
    evidence: string;
    opportunityId: string;
    opportunityLabel: string;
    /** False when the duration was not stated and the default was applied. */
    durationStated: boolean;
}

/** Words that make a sentence a commitment rather than a note about work. */
const EVENT_WORDS = [
    'junta', 'juntas', 'reunion', 'reunión', 'reuniones', 'cita', 'llamada', 'call', 'meeting',
    'meet', 'kickoff', 'kick-off', 'kick off', 'demo', 'presentacion', 'presentación', 'sesion',
    'sesión', 'revision con', 'revisión con', 'entrevista', 'visita', 'workshop', 'taller',
    'conference', 'sync', 'daily', 'standup', 'stand-up', 'teams con', 'videollamada',
];

const WEEKDAYS: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6,
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const MONTHS: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
    septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
};

const stripAccents = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

const toIso = (date: Date): string => date.toLocaleDateString('en-CA');

const addDays = (iso: string, days: number): string => {
    const date = new Date(`${iso}T00:00:00`);
    date.setDate(date.getDate() + days);
    return toIso(date);
};

const pad = (value: number): string => String(value).padStart(2, '0');

const addMinutes = (time: string, minutes: number): string => {
    const [hours, mins] = time.split(':').map(Number);
    const total = Math.min(23 * 60 + 59, hours * 60 + mins + minutes);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/**
 * Resolves the day a sentence refers to, relative to the day the text itself was written.
 *
 * "mañana junta a las 12" written on the 17th means the 18th, not tomorrow-from-today. Anchoring on
 * the note's own date is what makes an old note stop injecting a meeting into this week.
 */
const resolveDate = (text: string, anchorIso: string): string | null => {
    const lower = stripAccents(text.toLowerCase());

    const explicitIso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (explicitIso) return `${explicitIso[1]}-${explicitIso[2]}-${explicitIso[3]}`;

    // "19/09", "19/09/2026", "19-09"
    const numeric = lower.match(/\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?\b/);
    if (numeric) {
        const day = Number(numeric[1]);
        const month = Number(numeric[2]);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            let year = numeric[3] ? Number(numeric[3]) : Number(anchorIso.slice(0, 4));
            if (year < 100) year += 2000;
            return `${year}-${pad(month)}-${pad(day)}`;
        }
    }

    // "19 de septiembre", "september 19"
    const monthNames = Object.keys(MONTHS).join('|');
    const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${monthNames})\\b`));
    const monthDay = lower.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})\\b`));
    const named = dayMonth
        ? { day: Number(dayMonth[1]), month: MONTHS[dayMonth[2]] }
        : monthDay ? { day: Number(monthDay[2]), month: MONTHS[monthDay[1]] } : null;
    if (named) {
        const year = Number(anchorIso.slice(0, 4));
        const candidate = `${year}-${pad(named.month)}-${pad(named.day)}`;
        // A month already past relative to the anchor means next year ("2 de enero" written in December).
        return candidate < addDays(anchorIso, -30) ? `${year + 1}-${pad(named.month)}-${pad(named.day)}` : candidate;
    }

    if (/\bpasado\s+manana\b|\bday\s+after\s+tomorrow\b/.test(lower)) return addDays(anchorIso, 2);
    if (/\bmanana\b|\btomorrow\b/.test(lower)) return addDays(anchorIso, 1);
    if (/\bhoy\b|\btoday\b|\besta\s+tarde\b|\bthis\s+afternoon\b/.test(lower)) return anchorIso;

    // "el lunes", "next friday" — the next occurrence strictly after the anchor day.
    const weekdayNames = Object.keys(WEEKDAYS).map(stripAccents).join('|');
    const weekday = lower.match(new RegExp(`\\b(?:el|next|proximo|este)?\\s*(${weekdayNames})\\b`));
    if (weekday) {
        const target = WEEKDAYS[weekday[1]] ?? WEEKDAYS[Object.keys(WEEKDAYS).find(key => stripAccents(key) === weekday[1]) || ''];
        if (typeof target === 'number') {
            const anchor = new Date(`${anchorIso}T00:00:00`);
            let delta = (target - anchor.getDay() + 7) % 7;
            if (delta === 0) delta = 7;
            return addDays(anchorIso, delta);
        }
    }
    return null;
};

/** "a las 12", "12:30", "9 am", "a las 4 pm". Returns 24h HH:mm or null. */
const resolveTime = (text: string): string | null => {
    const lower = stripAccents(text.toLowerCase());
    const match = lower.match(/\b(?:a\s+las?\s+|at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?|horas?)?\b/g);
    if (!match) return null;
    // Re-scan with capture groups, preferring an explicit "a las"/"at" marker over a bare number,
    // so "1 hora" is never read as "01:00".
    const candidates: Array<{ time: string; explicit: boolean }> = [];
    const scanner = /(\ba\s+las?\s+|\bat\s+|@\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g;
    let found: RegExpExecArray | null;
    while ((found = scanner.exec(lower)) !== null) {
        const marker = found[1];
        const minutes = found[3];
        const meridiem = found[4];
        // A bare integer with no marker, no ":" and no am/pm is not a time (it is a duration or a count).
        if (!marker && !minutes && !meridiem) continue;
        // A number immediately followed by an hour/minute word is a duration, not a start time.
        const after = lower.slice(scanner.lastIndex, scanner.lastIndex + 12);
        if (/^\s*(h\b|hr|hora|minuto|min\b)/.test(after) && !marker) continue;
        let hours = Number(found[2]);
        if (hours > 23) continue;
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
        // No meridiem and a small hour in a work context means the afternoon: "a las 4" is 16:00.
        if (!meridiem && marker && hours >= 1 && hours <= 6) hours += 12;
        candidates.push({ time: `${pad(hours)}:${minutes || '00'}`, explicit: Boolean(marker) });
    }
    if (!candidates.length) return null;
    return (candidates.find(candidate => candidate.explicit) || candidates[0]).time;
};

/** "1 hora", "30 min", "1.5h", "hora y media". Returns minutes or null when not stated. */
const resolveDurationMinutes = (text: string): number | null => {
    const lower = stripAccents(text.toLowerCase());
    if (/\bhora\s+y\s+media\b|\ban\s+hour\s+and\s+a\s+half\b/.test(lower)) return 90;
    if (/\bmedia\s+hora\b|\bhalf\s+an\s+hour\b/.test(lower)) return 30;
    const minutes = lower.match(/\b(\d{1,3})\s*(?:min|mins|minuto|minutos|minutes)\b/);
    if (minutes) return Math.min(600, Number(minutes[1]));
    const hours = lower.match(/\b(\d{1,2})(?:[.,](\d))?\s*(?:h\b|hr|hrs|hora|horas|hour|hours)\b/);
    if (hours) {
        const whole = Number(hours[1]);
        const fraction = hours[2] ? Number(hours[2]) / 10 : 0;
        return Math.min(600, Math.round((whole + fraction) * 60));
    }
    return null;
};

/** Meetings default to an hour: it is the common case and it errs toward protecting the slot. */
const DEFAULT_MEETING_MINUTES = 60;

const cleanText = (value: string): string =>
    (value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Splits prose into sentences so one note can hold several meetings without merging them. */
const sentencesOf = (value: string): string[] =>
    cleanText(value)
        .split(/(?<=[.;!?])\s+|\s*\n+\s*|\s+[-•]\s+/)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 3 && sentence.length < 400);

const mentionsEvent = (sentence: string): boolean => {
    const lower = stripAccents(sentence.toLowerCase());
    return EVENT_WORDS.some(word => lower.includes(stripAccents(word)));
};

/** Trims the sentence into something that reads as a calendar entry. */
const titleFor = (sentence: string): string => {
    const compact = sentence.replace(/\s+/g, ' ').trim();
    return compact.length <= 70 ? compact : `${compact.slice(0, 67).trim()}…`;
};

const scanSource = (
    text: string,
    anchorIso: string,
    source: FixedCommitment['source'],
    sourceLabel: string,
    opportunity: Opportunity,
    horizon: { start: string; end: string },
    out: FixedCommitment[],
): void => {
    for (const sentence of sentencesOf(text)) {
        if (!mentionsEvent(sentence)) continue;
        const date = resolveDate(sentence, anchorIso);
        if (!date || date < horizon.start || date > horizon.end) continue;
        const startTime = resolveTime(sentence);
        // No time means no commitment: a meeting "next week" cannot block a slot.
        if (!startTime) continue;
        const stated = resolveDurationMinutes(sentence);
        out.push({
            id: `${source}-${opportunity.id}-${date}-${startTime}-${out.length}`,
            date,
            startTime,
            endTime: addMinutes(startTime, stated ?? DEFAULT_MEETING_MINUTES),
            title: titleFor(sentence),
            source,
            sourceLabel,
            evidence: sentence,
            opportunityId: opportunity.id,
            opportunityLabel: opportunity.alias || opportunity.title,
            durationStated: stated !== null,
        });
    }
};

export interface ExtractCommitmentsOptions {
    /** Only commitments inside this span matter to a run; anything else is noise. */
    horizonStart: string;
    horizonEnd: string;
    reminders?: Reminder[];
    /** Ids the user unticked in the UI. They stay out of the prompt. */
    dismissedIds?: string[];
}

/**
 * Reads every note, history event and reminder and returns the meetings found inside the horizon.
 *
 * Reminders are included without any parsing: `dueAt` is already an exact datetime the user set on
 * purpose, which makes it the most reliable commitment in the database.
 */
export const extractFixedCommitments = (
    opportunities: Opportunity[],
    options: ExtractCommitmentsOptions,
): FixedCommitment[] => {
    const horizon = { start: options.horizonStart, end: options.horizonEnd };
    const found: FixedCommitment[] = [];

    for (const opportunity of opportunities) {
        for (const note of (opportunity.notes || []) as MeetingNote[]) {
            // The SOW note is a structured form, not prose; scanning it only produces noise.
            if (note.format === 'sow') continue;
            const anchor = note.date || horizon.start;
            scanSource(`${note.title || ''}. ${note.content || ''}`, anchor, 'note', note.title || 'Nota', opportunity, horizon, found);
        }
        for (const event of opportunity.history || []) {
            scanSource(event.content || '', event.date || horizon.start, 'history', 'Evento de historial', opportunity, horizon, found);
        }
    }

    for (const reminder of options.reminders || []) {
        if (reminder.seenAt) continue;
        const date = (reminder.dueAt || '').slice(0, 10);
        const startTime = (reminder.dueAt || '').slice(11, 16);
        if (!date || !startTime || date < horizon.start || date > horizon.end) continue;
        // A reminder is only a commitment when it names an event; otherwise it is a nudge to do
        // work, and work already has its own blocks.
        if (!mentionsEvent(reminder.title || '')) continue;
        const opportunity = opportunities.find(item => item.id === reminder.opportunityId);
        const stated = resolveDurationMinutes(reminder.title || '');
        found.push({
            id: `reminder-${reminder.id}`,
            date,
            startTime,
            endTime: addMinutes(startTime, stated ?? DEFAULT_MEETING_MINUTES),
            title: titleFor(reminder.title || 'Recordatorio'),
            source: 'reminder',
            sourceLabel: 'Recordatorio',
            evidence: reminder.title || '',
            opportunityId: reminder.opportunityId,
            opportunityLabel: opportunity ? (opportunity.alias || opportunity.title) : reminder.opportunityId,
            durationStated: stated !== null,
        });
    }

    const dismissed = new Set(options.dismissedIds || []);
    // Two sources describing the same meeting (a note and the reminder created from it) would
    // subtract the slot twice, so identical date+time+opportunity collapses into one.
    const seen = new Set<string>();
    return found
        .filter(commitment => !dismissed.has(commitment.id))
        .filter(commitment => {
            const key = `${commitment.opportunityId}|${commitment.date}|${commitment.startTime}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
};
