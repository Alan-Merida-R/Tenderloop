import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Check, ChevronDown, ChevronUp, Copy, Globe, History, Moon, Sparkles, Sun, Trash2, X } from 'lucide-react';
import { AlarmConfig, DEFAULT_FOCUS_POLICY, DEFAULT_PERSONAL_CONSTRAINTS, FocusPolicy, Opportunity, PersonalConstraints, QuickOrganizerPreferences, QuickOrganizerRun, Reminder, Task } from '../../types';
import { extractFixedCommitments } from '../../services/commitmentExtractor';
import type { ScopeCatalog } from '../../components/scopeCatalog';
import type { TaskStandardLike } from '../../services/executionModel';
import { isOpportunitySchedulable, isTaskActive } from '../schedule/scheduleHelpers';
import { createBlock } from '../schedule/executionBlockUtils';
import { buildOrganizerPrompt, ORGANIZER_CHIPS, TimeRange } from './promptBuilder';
import { insertTasksInPlan } from '../../services/taskUtils';
import { buildExecutionModel, forecastTask } from '../../services/executionModel';
import {
    ParsedContingentRow, ParsedDeliveryDateRow, ParsedDueDateRow, ParsedExternalPushRow, ParsedMeta,
    ParsedMissingTaskSuggestion, ParsedOpportunityAssessment, ParsedOutOfScopeRow, ParsedQueueRow,
    ParsedQuestionRow, ParsedRankingRow, ParsedReminderRow, ParsedScheduleRow, ParsedSuggestedMoveRow, parseOrganizerResponse,
} from './responseParser';
import { QuickOrganizerReview } from './QuickOrganizerReview';
import { QuickOrganizerAvailabilityPicker } from './QuickOrganizerAvailabilityPicker';

interface Props {
    opportunities: Opportunity[];
    reminders: Reminder[];
    userName: string;
    onOppUpdate: (updated: Opportunity, id?: string, immediate?: boolean) => void;
    onAddReminder: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => void;
    onDeleteReminder: (id: string) => void;
    onClose: () => void;
    organizerHistory: QuickOrganizerRun[];
    organizerPreferences: QuickOrganizerPreferences;
    onSaveOrganizerRun: (run: QuickOrganizerRun) => void;
    onDeleteOrganizerRun: (id: string) => void;
    onOrganizerPreferencesChange: (preferences: QuickOrganizerPreferences) => void;
    /**
     * [TA6] The user's real holiday list (Settings -> Holidays), the same one the KPI
     * business-day math uses. Without it the organizer was proposing work on public holidays.
     */
    holidays?: string[];
    /** [TA6] Proposal alarm policy + scope catalog: the app's own measure of how big a proposal is. */
    alarms?: AlarmConfig[];
    scopeCatalog?: ScopeCatalog;
    /** [TA6] Settings task standards — the user's declared duration per task, used when the timer is empty. */
    taskStandards?: TaskStandardLike[];
    /** Called right after a plan is accepted — the host navigates to the Tasks view in Agenda mode. */
    onPlanAccepted?: () => void;
}

/** Marks the block of answers appended to the extra instructions, so a second round replaces it. */
const ANSWER_BLOCK_MARKER = '=== MY ANSWERS TO YOUR QUESTIONS ===';

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 px-2 py-1 focus:border-[#3DCD58] focus:ring-0 w-full';

interface DayOption {
    iso: string; // YYYY-MM-DD
    weekday: string; // "Mon"
    dayNum: number;
    isToday: boolean;
}

/** Today through the same weekday next week (8 days, inclusive). */
const buildDayWindow = (language: 'en' | 'es'): DayOption[] => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 8 }, (_, i) => {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        return {
            iso: d.toLocaleDateString('en-CA'),
            weekday: d.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { weekday: 'short' }),
            dayNum: d.getDate(),
            isToday: i === 0,
        };
    });
};

export const QuickOrganizerView: React.FC<Props> = ({ opportunities, reminders, userName, onOppUpdate, onAddReminder, onDeleteReminder, onClose, organizerHistory, organizerPreferences, onSaveOrganizerRun, onDeleteOrganizerRun, onOrganizerPreferencesChange, holidays = [], alarms, scopeCatalog, taskStandards, onPlanAccepted }) => {
    const [phase, setPhase] = useState<'main' | 'review'>('main');
    const [extraInstructions, setExtraInstructions] = useState('');
    const [activeChipIds, setActiveChipIds] = useState<string[]>([]);
    const [focusPolicy, setFocusPolicy] = useState<FocusPolicy>(organizerPreferences.focusPolicy || DEFAULT_FOCUS_POLICY);
    /** Persisted with the database so the policy travels with the user, not the browser. */
    /**
     * The execution model is a pure function of the opportunities, so it is derived rather than
     * stored; the copy kept in preferences is only a snapshot so the calibration travels with the
     * database. Nothing leaves the machine.
     */
    const executionModel = useMemo(() => buildExecutionModel(opportunities, { taskStandards }), [opportunities, taskStandards]);

    const updateFocusPolicy = (patch: Partial<FocusPolicy>) => {
        const next = { ...focusPolicy, ...patch };
        setFocusPolicy(next);
        onOrganizerPreferencesChange({ ...organizerPreferences, focusPolicy: next, executionModel });
    };
    const [recommendationLanguage, setRecommendationLanguage] = useState<'en' | 'es'>(organizerPreferences.displayLanguage || 'es');
    const [organizerTheme, setOrganizerTheme] = useState<'light' | 'dark'>(organizerPreferences.theme || 'light');
    // [TA6] Every time in the prompt is stated in this zone, so "send it before 10:00 their
    // time" means something. Auto-detected, overridable, and persisted with the database.
    const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City', []);
    const [timezone, setTimezone] = useState<string>(organizerPreferences.timezone || browserTimezone);
    // Most external counterparts in this workflow are in Texas, so US Central is the default the
    // organizer assumes for anyone with no timezone recorded, rather than the user's own zone.
    const [stakeholderTimezone, setStakeholderTimezone] = useState<string>(organizerPreferences.stakeholderTimezone || 'America/Chicago');
    const [personalConstraints, setPersonalConstraints] = useState<PersonalConstraints>(organizerPreferences.personalConstraints || DEFAULT_PERSONAL_CONSTRAINTS);
    const [showConstraints, setShowConstraints] = useState(false);
    const [availabilityMode, setAvailabilityMode] = useState<'classic' | 'calendar'>('classic');
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const dayWindow = useMemo(() => buildDayWindow(recommendationLanguage), [recommendationLanguage]);

    // A preference change must preserve the other Quick Organizer controls. Changing only the
    // theme used to replace the complete preferences object and erase TA6 configuration.
    const savePreferences = (patch: Partial<QuickOrganizerPreferences>) => onOrganizerPreferencesChange({
        ...organizerPreferences,
        theme: organizerTheme,
        displayLanguage: recommendationLanguage,
        timezone,
        stakeholderTimezone,
        personalConstraints,
        focusPolicy,
        executionModel,
        ...patch,
    });

    const eligibleOpps = useMemo(
        () => opportunities
            .filter(isOpportunitySchedulable)
            .filter(opp => (opp.tasks || []).some(isTaskActive))
            .map(opp => ({ id: opp.id, label: opp.alias || opp.title, taskCount: (opp.tasks || []).filter(isTaskActive).length, expected: opp.dates?.expected || '', quoteType: opp.quoteType || 'Unspecified', pendingDays: opp.dates?.requested ? Math.max(0, Math.floor((Date.now() - new Date(`${opp.dates.requested}T00:00:00`).getTime()) / 86400000)) : null })),
        [opportunities]
    );
    // Keep the prompt intentionally small: an empty selection excludes all opportunities.
    const [selectedOppIds, setSelectedOppIds] = useState<string[]>(() => opportunities
        .filter(isOpportunitySchedulable)
        .filter(opp => (opp.tasks || []).some(isTaskActive))
        .sort((a, b) => (a.priorityOrder ?? Number.MAX_SAFE_INTEGER) - (b.priorityOrder ?? Number.MAX_SAFE_INTEGER))
        .map(opp => opp.id));

    /** Tasks whose current due date is earlier than what the model says is achievable. */
    const atRiskTasks = useMemo(() => {
        const selected = new Set(selectedOppIds);
        const rows: { oppLabel: string; task: Task; forecast: ReturnType<typeof forecastTask> }[] = [];
        for (const opp of opportunities) {
            if (selected.size && !selected.has(opp.id)) continue;
            for (const task of (opp.tasks || []).filter(isTaskActive)) {
                if (!task.dueDate) continue;
                const forecast = forecastTask(task, executionModel, { dailyCapacityHours: focusPolicy.enabled ? focusPolicy.maxDailyFocusHours : undefined });
                if (forecast.willMissDueDate) rows.push({ oppLabel: opp.alias || opp.title, task, forecast });
            }
        }
        return rows.sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
    }, [opportunities, selectedOppIds, executionModel, focusPolicy]);
    const toggleOpp = (id: string) => setSelectedOppIds(prev => prev.includes(id) ? prev.filter(o => o !== id) : prev.length < 8 ? [...prev, id] : prev);
    const moveOpp = (id: string, direction: -1 | 1) => setSelectedOppIds(prev => { const index = prev.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= prev.length) return prev; const next = [...prev]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    // Keyed by ISO date; presence of a key = that date is selected. Each date starts with one
    // default 08:00–17:00 range, editable/removable/addable — "which lapsos do I want to work
    // that day," per date.
    const [timeRangesByDate, setTimeRangesByDate] = useState<Record<string, TimeRange[]>>({});
    const isDaySelected = (iso: string) => iso in timeRangesByDate;
    const toggleDate = (iso: string) => setTimeRangesByDate(prev => {
        if (iso in prev) {
            const next = { ...prev };
            delete next[iso];
            return next;
        }
        return { ...prev, [iso]: [{ start: '08:00', end: '17:00' }] };
    });
    const selectNextWorkWeek = () => {
        const nextFive = dayWindow.filter(day => {
            const weekday = new Date(`${day.iso}T00:00:00`).getDay();
            return weekday >= 1 && weekday <= 5;
        }).slice(0, 5);
        setTimeRangesByDate(Object.fromEntries(nextFive.map(day => [day.iso, [{ start: '08:00', end: '17:00' }]])));
    };
    const addRange = (iso: string) => setTimeRangesByDate(prev => ({ ...prev, [iso]: [...(prev[iso] || []), { start: '08:00', end: '17:00' }] }));
    const removeRange = (iso: string, idx: number) => setTimeRangesByDate(prev => ({ ...prev, [iso]: (prev[iso] || []).filter((_, i) => i !== idx) }));
    const updateRange = (iso: string, idx: number, patch: Partial<TimeRange>) => setTimeRangesByDate(prev => ({
        ...prev,
        [iso]: (prev[iso] || []).map((r, i) => i === idx ? { ...r, ...patch } : r),
    }));
    const todayLabel = useMemo(() => new Date().toLocaleDateString(recommendationLanguage === 'es' ? 'es-MX' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' }), [recommendationLanguage]);
    // [TA6] Meetings read out of the notes, history events and reminders the user already writes.
    // Shown before generating so a wrong detection can be unticked instead of silently eating an
    // hour of the plan.
    const [dismissedCommitmentIds, setDismissedCommitmentIds] = useState<string[]>([]);
    const detectedCommitments = useMemo(() => {
        const dates = Object.keys(timeRangesByDate).sort();
        const todayIso = new Date().toLocaleDateString('en-CA');
        return extractFixedCommitments(opportunities, {
            horizonStart: dates[0] || todayIso,
            horizonEnd: dates[dates.length - 1] || todayIso,
            reminders,
        });
    }, [opportunities, reminders, timeRangesByDate]);
    const activeCommitments = useMemo(
        () => detectedCommitments.filter(item => !dismissedCommitmentIds.includes(item.id)),
        [detectedCommitments, dismissedCommitmentIds]
    );

    const [prompt, setPrompt] = useState('');
    const [promptDirty, setPromptDirty] = useState(false);
    const [copied, setCopied] = useState(false);

    const [pasteText, setPasteText] = useState('');
    const [scheduleRows, setScheduleRows] = useState<ParsedScheduleRow[]>([]);
    const [reminderRows, setReminderRows] = useState<ParsedReminderRow[]>([]);
    const [dueDateRows, setDueDateRows] = useState<ParsedDueDateRow[]>([]);
    const [parseErrors, setParseErrors] = useState<{ section: string; line: string; reason: string }[]>([]);
    const [recommendations, setRecommendations] = useState<string[]>([]);
    const [paretoInsights, setParetoInsights] = useState<string[]>([]);
    const [blockerInsights, setBlockerInsights] = useState<string[]>([]);
    const [deliveryInsights, setDeliveryInsights] = useState<string[]>([]);
    const [missingTaskInsights, setMissingTaskInsights] = useState<string[]>([]);
    const [missingTaskSuggestions, setMissingTaskSuggestions] = useState<ParsedMissingTaskSuggestion[]>([]);
    const [queuedTaskSuggestions, setQueuedTaskSuggestions] = useState<ParsedMissingTaskSuggestion[]>([]);
    const [opportunityAssessments, setOpportunityAssessments] = useState<ParsedOpportunityAssessment[]>([]);
    // [TA6] Delivery dates are applied like due dates; everything below them is advisory and is
    // only rendered for the user to act on by hand.
    const [deliveryDateRows, setDeliveryDateRows] = useState<ParsedDeliveryDateRow[]>([]);
    const [rankingRows, setRankingRows] = useState<ParsedRankingRow[]>([]);
    const [externalPushRows, setExternalPushRows] = useState<ParsedExternalPushRow[]>([]);
    const [contingentRows, setContingentRows] = useState<ParsedContingentRow[]>([]);
    const [queueRows, setQueueRows] = useState<ParsedQueueRow[]>([]);
    const [suggestedMoveRows, setSuggestedMoveRows] = useState<ParsedSuggestedMoveRow[]>([]);
    const [outOfScopeRows, setOutOfScopeRows] = useState<ParsedOutOfScopeRow[]>([]);
    const [assumptions, setAssumptions] = useState<string[]>([]);
    const [questionRows, setQuestionRows] = useState<ParsedQuestionRow[]>([]);
    const [responseMeta, setResponseMeta] = useState<ParsedMeta | null>(null);
    const [applied, setApplied] = useState(false);

    const stats = useMemo(() => {
        let eligibleTasks = 0, alreadyScheduled = 0, opps = 0;
        for (const opp of opportunities) {
            if (!isOpportunitySchedulable(opp)) continue;
            const tasks = (opp.tasks || []).filter(isTaskActive);
            if (!tasks.length) continue;
            opps++;
            eligibleTasks += tasks.length;
            alreadyScheduled += tasks.filter(t => (t.executionBlocks?.length ?? 0) > 0).length;
        }
        return { eligibleTasks, alreadyScheduled, opps };
    }, [opportunities]);

    const generatedPrompt = useMemo(
        () => buildOrganizerPrompt(opportunities, { userName, extraInstructions, activeChipIds, dayWindows: timeRangesByDate, oppIds: selectedOppIds, recommendationLanguage, reminders, focusPolicy, executionModel, holidays, timezone, fixedCommitments: activeCommitments, personalConstraints, stakeholderTimezone, alarms, scopeCatalog }),
        [opportunities, userName, extraInstructions, activeChipIds, timeRangesByDate, selectedOppIds, recommendationLanguage, reminders, focusPolicy, executionModel, holidays, timezone, activeCommitments, personalConstraints, stakeholderTimezone, alarms, scopeCatalog]
    );

    // Keep the editable prompt in sync with instructions/chips until the user
    // hand-edits it directly — at that point we stop overwriting their edits.
    useEffect(() => {
        if (!promptDirty) setPrompt(generatedPrompt);
    }, [generatedPrompt, promptDirty]);

    const toggleChip = (id: string) => {
        setActiveChipIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    };

    const changeLanguage = (language: 'en' | 'es') => {
        setRecommendationLanguage(language);
        savePreferences({ displayLanguage: language });
    };
    const changeTimezone = (value: string) => {
        setTimezone(value);
        savePreferences({ timezone: value });
    };
    const changeStakeholderTimezone = (value: string) => {
        setStakeholderTimezone(value);
        savePreferences({ stakeholderTimezone: value });
    };
    const updateConstraints = (patch: Partial<PersonalConstraints>) => {
        const next = { ...personalConstraints, ...patch };
        setPersonalConstraints(next);
        savePreferences({ personalConstraints: next });
    };
    const changeTheme = (theme: 'light' | 'dark') => {
        setOrganizerTheme(theme);
        savePreferences({ theme });
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard permission denied — user can still select+copy manually */ }
    };

    const importAnalysis = (sourceText: string, windows: Record<string, TimeRange[]>, saveAsNew: boolean) => {
        const result = parseOrganizerResponse(sourceText, opportunities, { dayWindows: windows });
        setScheduleRows(result.scheduleRows);
        const tasksWithCurrentReminder = new Set(reminders
            .filter(reminder => !reminder.seenAt)
            .filter(reminder => reminder.taskId)
            .map(reminder => `${reminder.opportunityId}::${reminder.taskId}`));
        const importedTaskKeys = new Set<string>();
        setReminderRows(result.reminderRows.filter(row => {
            const key = `${row.oppId}::${row.taskId}`;
            if (tasksWithCurrentReminder.has(key) || importedTaskKeys.has(key)) return false;
            importedTaskKeys.add(key);
            return true;
        }));
        setParseErrors(
            result.scheduleRows.length || result.reminderRows.length || result.dueDateRows.length
                ? result.errors
                : [...result.errors, { section: 'FORMAT', line: '', reason: 'No structured SCHEDULE, PROPOSED_DUE_DATES or REMINDERS rows were detected. Review the imported analysis, then go back and ask the AI to reproduce the exact table format.' }]
        );
        setRecommendations(result.recommendations);
        setParetoInsights(result.paretoInsights);
        setBlockerInsights(result.blockerInsights);
        setDeliveryInsights(result.deliveryInsights);
        setMissingTaskInsights(result.missingTaskInsights);
        setMissingTaskSuggestions(result.missingTaskSuggestions);
        setQueuedTaskSuggestions([]);
        setOpportunityAssessments(result.opportunityAssessments);
        setRankingRows(result.rankingRows);
        setExternalPushRows(result.externalPushRows);
        setContingentRows(result.contingentRows);
        setQueueRows(result.queueRows);
        setSuggestedMoveRows(result.suggestedMoveRows);
        setOutOfScopeRows(result.outOfScopeRows);
        setAssumptions(result.assumptions);
        setQuestionRows(result.questionRows);
        setResponseMeta(result.meta);
        // One row per opportunity at most: a second proposal for the same delivery date is a
        // contradiction, and silently applying the last one would hide it.
        const importedDeliveryOppIds = new Set<string>();
        setDeliveryDateRows(result.deliveryDateRows.filter(row => {
            if (importedDeliveryOppIds.has(row.oppId)) return false;
            importedDeliveryOppIds.add(row.oppId);
            return true;
        }));
        const importedDueDateKeys = new Set<string>();
        setDueDateRows(result.dueDateRows.filter(row => {
            const key = `${row.oppId}::${row.taskId}`;
            if (importedDueDateKeys.has(key)) return false;
            importedDueDateKeys.add(key);
            return true;
        }));
        setApplied(false);
        if (saveAsNew) {
            const now = new Date().toISOString();
            const run: QuickOrganizerRun = {
                id: crypto.randomUUID(), createdAt: now, updatedAt: now,
                displayLanguage: recommendationLanguage, selectedOppIds: [...selectedOppIds],
                dayWindows: windows, prompt, response: sourceText,
            };
            setActiveRunId(run.id);
            onSaveOrganizerRun(run);
        }
        // Always open review after a non-empty paste. Even a partially malformed answer
        // must be inspectable so the user is never trapped on the paste screen.
        if (sourceText.trim()) setPhase('review');
    };

    const handleParse = () => importAnalysis(pasteText, timeRangesByDate, true);

    const openSavedRun = (run: QuickOrganizerRun) => {
        setActiveRunId(run.id);
        setSelectedOppIds(run.selectedOppIds);
        setTimeRangesByDate(run.dayWindows);
        setRecommendationLanguage(run.displayLanguage);
        setPrompt(run.prompt);
        setPromptDirty(true);
        setPasteText(run.response);
        importAnalysis(run.response, run.dayWindows, false);
    };

    const updateQuestionAnswer = (id: string, answer: string) =>
        setQuestionRows(prev => prev.map(row => row.id === id ? { ...row, answer } : row));

    /**
     * [TA6] The second pass. The answers are appended to the extra instructions rather than sent
     * anywhere: the user copies the regenerated prompt into the same chat and the analysis runs
     * again with the gaps closed. Previous answer blocks are replaced, never stacked, so answering
     * twice does not leave the model reading two contradictory sets of answers.
     */
    const applyQuestionAnswers = () => {
        const answered = questionRows.filter(row => row.answer.trim());
        if (!answered.length) return;
        const block = [
            ANSWER_BLOCK_MARKER,
            'These are my answers to the questions you asked in your previous answer. They are binding and they override any assumption you made in their place. Re-run the full analysis with them.',
            ...answered.map(row => `- ${row.question} -> ${row.answer.trim()}`),
        ].join('\n');
        setExtraInstructions(current => {
            const withoutPrevious = current.split(ANSWER_BLOCK_MARKER)[0].trimEnd();
            return withoutPrevious ? `${withoutPrevious}\n\n${block}` : block;
        });
        setPromptDirty(false);
        setPhase('main');
    };

    const removeScheduleRow = (id: string) => setScheduleRows(prev => prev.filter(r => r.id !== id));
    const removeReminderRow = (id: string) => setReminderRows(prev => prev.filter(r => r.id !== id));
    const removeDueDateRow = (id: string) => setDueDateRows(prev => prev.filter(r => r.id !== id));
    const removeDeliveryDateRow = (id: string) => setDeliveryDateRows(prev => prev.filter(r => r.id !== id));
    const updateDeliveryDateRow = (id: string, patch: Partial<ParsedDeliveryDateRow>) =>
        setDeliveryDateRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));

    const updateScheduleRow = (id: string, patch: Partial<ParsedScheduleRow>) =>
        setScheduleRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const updateReminderRow = (id: string, patch: Partial<ParsedReminderRow>) =>
        setReminderRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const updateDueDateRow = (id: string, patch: Partial<ParsedDueDateRow>) => setDueDateRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));

    const scheduleTaskInDraft = (oppId: string, taskId: string) => {
        const opp = opportunities.find(o => o.id === oppId);
        const task = opp?.tasks?.find(t => t.id === taskId);
        if (!opp || !task) return;
        const allowedDates = Object.keys(timeRangesByDate).sort();
        const today = new Date().toLocaleDateString('en-CA');
        const date = task.dueDate && task.dueDate >= today && (!allowedDates.length || allowedDates.includes(task.dueDate))
            ? task.dueDate
            : allowedDates[0] || today;
        const range = timeRangesByDate[date]?.[0] || { start: '09:00', end: '10:00' };
        setScheduleRows(prev => [...prev, {
            id: `draft-${Date.now()}-${oppId}-${taskId}`,
            key: `${oppId}::${taskId}`,
            oppId,
            taskId,
            oppLabel: opp.alias || opp.title,
            taskLabel: task.title,
            date,
            startTime: range.start,
            endTime: range.end,
            note: 'Added during plan review',
        }]);
    };

    const queueSuggestedTask = (suggestion: ParsedMissingTaskSuggestion) => setQueuedTaskSuggestions(current =>
        current.some(item => item.id === suggestion.id) ? current : [...current, suggestion]
    );

    const handleApply = () => {
        const selectedSet = new Set(selectedOppIds);
        for (const reminder of reminders) {
            if (!selectedSet.has(reminder.opportunityId)) continue;
            const opp = opportunities.find(item => item.id === reminder.opportunityId);
            const task = reminder.taskId ? opp?.tasks?.find(item => item.id === reminder.taskId) : undefined;
            const obsolete = Boolean(reminder.seenAt)
                || new Date(reminder.dueAt).getTime() < Date.now()
                || Boolean(reminder.taskId && (!task || task.status === 'Done' || task.status === 'Canceled'));
            if (obsolete) onDeleteReminder(reminder.id);
        }
        const byOpp = new Map<string, Map<string, ParsedScheduleRow[]>>();
        for (const row of scheduleRows) {
            if (!byOpp.has(row.oppId)) byOpp.set(row.oppId, new Map());
            const byTask = byOpp.get(row.oppId)!;
            if (!byTask.has(row.taskId)) byTask.set(row.taskId, []);
            byTask.get(row.taskId)!.push(row);
        }

        const affectedOppIds = new Set([...byOpp.keys(), ...dueDateRows.map(row => row.oppId), ...deliveryDateRows.map(row => row.oppId), ...queuedTaskSuggestions.map(item => item.oppId)]);
        for (const oppId of affectedOppIds) {
            const byTask = byOpp.get(oppId) || new Map<string, ParsedScheduleRow[]>();
            const opp = opportunities.find(o => o.id === oppId);
            if (!opp) continue;
            const updatedTasks = opp.tasks.map(t => {
                const rows = byTask.get(t.id);
                const proposedDueDate = dueDateRows.find(row => row.oppId === oppId && row.taskId === t.id)?.date;
                if (!rows && !proposedDueDate) return t;
                // Replace (not append) — a re-run always fully reschedules the task.
                const blocks = rows ? rows.map(r => createBlock(r.date, r.startTime, r.endTime)) : t.executionBlocks;
                return { ...t, executionBlocks: blocks, ...(proposedDueDate ? { dueDate: proposedDueDate } : {}) };
            });
            const existingTitles = new Set(updatedTasks.map(task => task.title.trim().toLowerCase()));
            const createdTasks: Task[] = queuedTaskSuggestions
                .filter(item => item.oppId === oppId && !existingTitles.has(item.titleEnglish.trim().toLowerCase()))
                .map(item => ({
                    id: crypto.randomUUID(), title: item.titleEnglish, description: '', status: 'Pending',
                    priority: 'Medium', owner: 'Me', externalAreas: [], responsible: '', dueDate: item.dueDate,
                    processSection: item.processSection,
                    // `order` is assigned by insertTasksInPlan, which puts the task at its place in
                    // the workflow instead of at the end of the list.
                    stageContext: opp.stage, subtasks: [], linkedNoteIds: [], order: null,
                    dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false,
                }));
            const plannedTasks = insertTasksInPlan(updatedTasks, createdTasks);
            // [TA6] The opportunity's own delivery date. Only moved when the AI proposed it AND the
            // commitment is not hard — a hard commitment belongs to the customer, not to the plan.
            const proposedDelivery = deliveryDateRows.find(row => row.oppId === oppId);
            const deliveryPatch = proposedDelivery && opp.commercial?.deliveryCommitted !== 'hard'
                ? { dates: { ...opp.dates, expected: proposedDelivery.date } }
                : {};
            onOppUpdate({ ...opp, ...deliveryPatch, tasks: plannedTasks, lastUpdated: new Date().toISOString() }, oppId, true);
        }

        const existingTaskReminders = new Set(reminders
            .filter(reminder => !reminder.seenAt)
            .filter(reminder => reminder.taskId)
            .map(reminder => `${reminder.opportunityId}::${reminder.taskId}`));
        for (const row of reminderRows) {
            const due = new Date(row.remindAt);
            if (isNaN(due.getTime())) continue;
            const taskKey = `${row.oppId}::${row.taskId}`;
            if (existingTaskReminders.has(taskKey)) continue;
            existingTaskReminders.add(taskKey);
            onAddReminder({ title: row.title, dueAt: due.toISOString(), opportunityId: row.oppId, taskId: row.taskId });
        }

        if (activeRunId) {
            const now = new Date().toISOString();
            const existing = organizerHistory.find(run => run.id === activeRunId);
            onSaveOrganizerRun(existing
                ? { ...existing, updatedAt: now, appliedAt: now }
                : { id: activeRunId, createdAt: now, updatedAt: now, appliedAt: now, displayLanguage: recommendationLanguage, selectedOppIds: [...selectedOppIds], dayWindows: timeRangesByDate, prompt, response: pasteText });
        }

        setApplied(true);
        setQueuedTaskSuggestions([]);
    };

    if (phase === 'review') {
        return <QuickOrganizerReview
            rows={scheduleRows}
            reminderRows={reminderRows}
            recommendations={recommendations}
            paretoInsights={paretoInsights}
            blockerInsights={blockerInsights}
            deliveryInsights={deliveryInsights}
            missingTaskInsights={missingTaskInsights}
            missingTaskSuggestions={missingTaskSuggestions}
            opportunityAssessments={opportunityAssessments}
            dueDateRows={dueDateRows}
            deliveryDateRows={deliveryDateRows}
            rankingRows={rankingRows}
            externalPushRows={externalPushRows}
            contingentRows={contingentRows}
            queueRows={queueRows}
            suggestedMoveRows={suggestedMoveRows}
            outOfScopeRows={outOfScopeRows}
            assumptions={assumptions}
            questionRows={questionRows}
            onQuestionAnswerChange={updateQuestionAnswer}
            onUseAnswers={applyQuestionAnswers}
            meta={responseMeta}
            opportunities={opportunities.filter(opp => selectedOppIds.includes(opp.id))}
            errors={parseErrors}
            onChange={updateScheduleRow}
            onReminderChange={updateReminderRow}
            onDueDateChange={updateDueDateRow}
            onRemove={removeScheduleRow}
            onRemoveReminder={removeReminderRow}
            onRemoveDueDate={removeDueDateRow}
            onDeliveryDateChange={updateDeliveryDateRow}
            onRemoveDeliveryDate={removeDeliveryDateRow}
            onScheduleTask={scheduleTaskInDraft}
            onCreateSuggestedTask={queueSuggestedTask}
            language={recommendationLanguage}
            theme={organizerTheme}
            onLanguageChange={changeLanguage}
            onThemeChange={changeTheme}
            onBack={() => setPhase('main')}
            onApply={() => {
                handleApply();
                // Jump straight to the Tasks Agenda so the user immediately sees the accepted plan.
                if (onPlanAccepted) onPlanAccepted();
                else setPhase('main');
            }}
        />;
    }

    return (
        <div className={`qo-scene-in fixed inset-0 z-[200] bg-gray-950 text-gray-100 flex flex-col overflow-hidden ${organizerTheme === 'light' ? 'qo-theme-light' : 'qo-theme-dark'}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#3DCD58] flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-black">Quick Organizer</h1>
                        <p className="text-[11px] text-gray-400">
                            {recommendationLanguage === 'es' ? <>Hoy es <span className="text-[#3DCD58] font-bold">{todayLabel}</span> · {stats.eligibleTasks} tareas abiertas en {stats.opps} oportunidades · {stats.alreadyScheduled} ya agendadas</> : <>Today is <span className="text-[#3DCD58] font-bold">{todayLabel}</span> · {stats.eligibleTasks} open task{stats.eligibleTasks === 1 ? '' : 's'} across {stats.opps} opportunit{stats.opps === 1 ? 'y' : 'ies'} · {stats.alreadyScheduled} already scheduled</>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1"><button onClick={() => changeTheme(organizerTheme === 'light' ? 'dark' : 'light')} className="p-2 rounded-lg hover:bg-gray-800 transition-colors" title={recommendationLanguage === 'es' ? 'Cambiar tema' : 'Change theme'}>{organizerTheme === 'light' ? <Moon className="w-4 h-4 text-gray-500" /> : <Sun className="w-4 h-4 text-gray-400" />}</button><button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 transition-colors" title="Back to Settings"><X className="w-5 h-5 text-gray-400" /></button></div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
                {organizerHistory.length > 0 && <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                    <div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400"><History className="h-4 w-4 text-[#3DCD58]" />{recommendationLanguage === 'es' ? 'Análisis PM guardados' : 'Saved PM analyses'}</h2><p className="mt-1 text-[10px] text-gray-500">{recommendationLanguage === 'es' ? 'Reabre un diagnóstico anterior sin volver a pasar por la IA.' : 'Reopen a previous diagnosis without returning to the AI.'}</p></div><span className="text-[10px] font-bold text-gray-500">{organizerHistory.length}/20</span></div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">{organizerHistory.slice(0, 6).map(run => <article key={run.id} className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/60 p-3"><button onClick={() => openSavedRun(run)} className="min-w-0 flex-1 text-left"><p className="truncate text-xs font-bold">{run.selectedOppIds.length} {recommendationLanguage === 'es' ? 'oportunidades analizadas' : 'opportunities analyzed'}</p><p className="mt-0.5 text-[9px] text-gray-500">{new Date(run.createdAt).toLocaleString(recommendationLanguage === 'es' ? 'es-MX' : 'en-US')} · {run.appliedAt ? (recommendationLanguage === 'es' ? 'Aplicado' : 'Applied') : (recommendationLanguage === 'es' ? 'Borrador' : 'Draft')}</p></button><button onClick={() => onDeleteOrganizerRun(run.id)} className="rounded p-1.5 text-gray-500 hover:bg-rose-950/50 hover:text-rose-400" title={recommendationLanguage === 'es' ? 'Eliminar análisis' : 'Delete analysis'}><Trash2 className="h-3.5 w-3.5" /></button></article>)}</div>
                </section>}
                {/* Step 1: opportunity picker */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{recommendationLanguage === 'es' ? '1. Selecciona y prioriza oportunidades' : '1. Select and prioritize opportunities'}</h2>
                        <button onClick={() => setSelectedOppIds(selectedOppIds.length === eligibleOpps.length ? [] : eligibleOpps.map(opp => opp.id))} className="text-[11px] font-bold text-gray-400 hover:text-gray-200">{selectedOppIds.length === eligibleOpps.length ? (recommendationLanguage === 'es' ? 'Excluir todas' : 'Exclude all') : (recommendationLanguage === 'es' ? 'Incluir todas' : 'Include all')}</button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                        {recommendationLanguage === 'es' ? `Selecciona las oportunidades y usa las flechas para definir su prioridad. (${selectedOppIds.length}/${eligibleOpps.length} seleccionadas)` : `Select the opportunities to analyze and use the arrows to set priority. Fewer opportunities keep the prompt reliable in smaller AI models. (${selectedOppIds.length}/${eligibleOpps.length} selected)`}
                    </p>
                    {eligibleOpps.length === 0 ? (
                        <p className="text-xs text-gray-500 py-2">{recommendationLanguage === 'es' ? 'No hay oportunidades con tareas abiertas.' : 'No opportunities with open tasks.'}</p>
                    ) : (
                        <div className="space-y-2">
                            {[...eligibleOpps].sort((a, b) => { const ai = selectedOppIds.indexOf(a.id), bi = selectedOppIds.indexOf(b.id); if (ai >= 0 && bi >= 0) return ai - bi; if (ai >= 0) return -1; if (bi >= 0) return 1; return a.label.localeCompare(b.label); }).map(opp => {
                                const active = selectedOppIds.includes(opp.id);
                                const rank = selectedOppIds.indexOf(opp.id);
                                return (
                                    <div key={opp.id} className={`grid grid-cols-[28px_32px_minmax(0,1fr)_auto] gap-2 items-center rounded-xl border p-2 ${active ? 'bg-emerald-950/30 border-[#3DCD58]/50' : 'bg-gray-800/40 border-gray-800 opacity-60'}`}>
                                        <input type="checkbox" checked={active} disabled={!active && selectedOppIds.length >= 8} onChange={() => toggleOpp(opp.id)} className="rounded border-gray-600 text-[#3DCD58] focus:ring-[#3DCD58] disabled:opacity-30" />
                                        <span className={`text-xs font-black text-center ${active ? 'text-[#3DCD58]' : 'text-gray-600'}`}>{active ? `#${rank + 1}` : '—'}</span>
                                        <button onClick={() => toggleOpp(opp.id)} className="text-left min-w-0"><p className="text-xs font-bold truncate">{opp.label}</p><p className="text-[10px] text-gray-400 mt-0.5">{recommendationLanguage === 'es' ? <>Entrega: {opp.expected || 'Sin fecha'} · {opp.quoteType} · {opp.pendingDays === null ? 'Antigüedad desconocida' : `${opp.pendingDays} días calendario`} · {opp.taskCount} tareas abiertas</> : <>Delivery: {opp.expected || 'Not set'} · {opp.quoteType} · {opp.pendingDays === null ? 'Age unknown' : `${opp.pendingDays} calendar days`} · {opp.taskCount} open tasks</>}</p></button>
                                        <div className="flex gap-1"><button disabled={!active || rank === 0} onClick={() => moveOpp(opp.id, -1)} className="p-1 text-gray-400 hover:text-white disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button><button disabled={!active || rank === selectedOppIds.length - 1} onClick={() => moveOpp(opp.id, 1)} className="p-1 text-gray-400 hover:text-white disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button></div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Step 2: day picker + per-day time ranges */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{recommendationLanguage === 'es' ? '2. ¿Qué días y horarios quieres organizar? (opcional)' : '2. Which days and time ranges should I schedule? (optional)'}</h2>
                        {Object.keys(timeRangesByDate).length > 0 && (
                            <button onClick={() => setTimeRangesByDate({})} className="text-[11px] font-bold text-gray-400 hover:text-gray-200">
                                {recommendationLanguage === 'es' ? 'Limpiar' : 'Clear'}
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                        {recommendationLanguage === 'es' ? 'Elige los días y los intervalos en que realmente puedes trabajar. Déjalo vacío para no limitar la propuesta.' : "Pick one or more days, then set the time ranges you're free. Leave empty to let the AI use any day/time."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={selectNextWorkWeek} className="px-3 py-1.5 rounded-lg border border-[#3DCD58]/60 text-[11px] font-bold text-[#3DCD58] hover:bg-emerald-950/40">{recommendationLanguage === 'es' ? 'Seleccionar próximos 5 días hábiles' : 'Select next 5 workdays'}</button>
                        <span className="self-center text-[10px] text-gray-500">{recommendationLanguage === 'es' ? 'Agrega un intervalo 08:00–17:00 por día.' : 'Adds one clean 08:00–17:00 window per day.'}</span>
                    </div>
                    <div className="flex w-fit rounded-lg border border-gray-700 bg-gray-950 p-1 text-[10px] font-black">
                        <button onClick={() => setAvailabilityMode('classic')} className={`rounded-md px-3 py-1.5 ${availabilityMode === 'classic' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:text-gray-200'}`}>{recommendationLanguage === 'es' ? 'HORARIOS CLÁSICOS' : 'CLASSIC TIMES'}</button>
                        <button onClick={() => setAvailabilityMode('calendar')} className={`rounded-md px-3 py-1.5 ${availabilityMode === 'calendar' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:text-gray-200'}`}>{recommendationLanguage === 'es' ? 'CALENDARIO VISUAL' : 'VISUAL CALENDAR'}</button>
                    </div>
                    {availabilityMode === 'calendar' && <QuickOrganizerAvailabilityPicker
                        days={dayWindow}
                        rangesByDate={timeRangesByDate}
                        onToggleDay={toggleDate}
                        onChange={setTimeRangesByDate}
                        language={recommendationLanguage}
                    />}
                    {availabilityMode === 'classic' && <>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {dayWindow.map(day => {
                            const active = isDaySelected(day.iso);
                            return (
                                <button
                                    key={day.iso}
                                    onClick={() => toggleDate(day.iso)}
                                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition-colors ${active ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : day.isToday ? 'border-[#3DCD58]/60 text-gray-200 hover:border-[#3DCD58]' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wide">{day.weekday}</span>
                                    <span className="text-sm font-black">{day.dayNum}</span>
                                    {day.isToday && <span className={`text-[8px] font-bold uppercase ${active ? 'text-white/80' : 'text-[#3DCD58]'}`}>{recommendationLanguage === 'es' ? 'Hoy' : 'Today'}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {Object.keys(timeRangesByDate).length > 0 && (
                        <div className="space-y-2 pt-1">
                            {Object.entries(timeRangesByDate)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([iso, ranges]: [string, TimeRange[]]) => {
                                    const dayInfo = dayWindow.find(d => d.iso === iso);
                                    return (
                                        <div key={iso} className="flex items-start gap-3 bg-gray-800/50 border border-gray-700 rounded-xl p-2.5">
                                            <span className="text-[11px] font-bold text-gray-300 w-16 pt-1.5 shrink-0">
                                                {dayInfo ? `${dayInfo.weekday} ${dayInfo.dayNum}` : iso}
                                            </span>
                                            <div className="flex-1 flex flex-wrap items-center gap-2">
                                                {ranges.map((r, idx) => (
                                                    <div key={idx} className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg px-1.5 py-1">
                                                        <input
                                                            type="time"
                                                            value={r.start}
                                                            onChange={e => updateRange(iso, idx, { start: e.target.value })}
                                                            className="bg-transparent text-[11px] text-gray-100 w-[82px] focus:outline-none"
                                                        />
                                                        <span className="text-gray-500 text-[11px]">–</span>
                                                        <input
                                                            type="time"
                                                            value={r.end}
                                                            onChange={e => updateRange(iso, idx, { end: e.target.value })}
                                                            className="bg-transparent text-[11px] text-gray-100 w-[82px] focus:outline-none"
                                                        />
                                                        {ranges.length > 1 && (
                                                            <button onClick={() => removeRange(iso, idx)} className="text-gray-500 hover:text-rose-400 ml-1">
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button onClick={() => addRange(iso)} className="text-[11px] font-bold text-[#3DCD58] hover:underline px-1">
                                                    {recommendationLanguage === 'es' ? '+ Agregar horario' : '+ Add range'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                    </>}
                </section>

                {/* Step 1: extra instructions */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{recommendationLanguage === 'es' ? '3. Instrucciones adicionales (opcional)' : '3. Extra instructions (optional)'}</h2>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-800/60 border border-gray-700 px-3 py-2">
                        <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-[#3DCD58]" /> {recommendationLanguage === 'es' ? 'Idioma del análisis y recordatorios' : 'Analysis and reminder language'}</span>
                        <div className="flex rounded-lg overflow-hidden border border-gray-700 text-[11px] font-bold">
                            <button onClick={() => changeLanguage('es')} className={`px-2.5 py-1 ${recommendationLanguage === 'es' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:text-white'}`}>Español</button>
                            <button onClick={() => changeLanguage('en')} className={`px-2.5 py-1 ${recommendationLanguage === 'en' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:text-white'}`}>English</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-800/60 border border-gray-700 px-3 py-2">
                        <div className="min-w-0">
                            <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#3DCD58]" /> {recommendationLanguage === 'es' ? 'Zona horaria y días festivos' : 'Timezone and holidays'}</span>
                            <p className="mt-0.5 text-[10px] text-gray-500">
                                {recommendationLanguage === 'es'
                                    ? <>Todas las horas del prompt se expresan en esta zona. Los festivos salen de Ajustes → Holidays: <b className={holidays.length ? 'text-[#3DCD58]' : 'text-amber-400'}>{holidays.length ? `${holidays.length} fecha(s) configurada(s)` : 'ninguno configurado, se usa una lista fija aproximada MX/US'}</b>.</>
                                    : <>Every time in the prompt is expressed in this zone. Holidays come from Settings → Holidays: <b className={holidays.length ? 'text-[#3DCD58]' : 'text-amber-400'}>{holidays.length ? `${holidays.length} date(s) configured` : 'none configured, a fixed MX/US approximation is used'}</b>.</>}
                            </p>
                        </div>
                        <input
                            value={timezone}
                            onChange={e => changeTimezone(e.target.value)}
                            placeholder={browserTimezone}
                            className="bg-gray-950 border border-gray-700 rounded-lg text-[11px] text-gray-100 px-2 py-1 w-[190px] focus:border-[#3DCD58] focus:ring-0"
                            title={recommendationLanguage === 'es' ? 'Zona horaria IANA, p. ej. America/Mexico_City' : 'IANA timezone, e.g. America/Mexico_City'}
                        />
                    </div>
                    <textarea
                        value={extraInstructions}
                        onChange={e => setExtraInstructions(e.target.value)}
                        placeholder={recommendationLanguage === 'es' ? 'Ej.: Reorganiza todo desde mañana y deja libre la hora de comida…' : 'e.g. Reschedule everything starting tomorrow and keep lunch free…'}
                        className={`${inputCls} h-16 resize-none`}
                    />
                    <div className="flex flex-wrap gap-2">
                        {ORGANIZER_CHIPS.map(chip => (
                            <button
                                key={chip.id}
                                onClick={() => toggleChip(chip.id)}
                                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${activeChipIds.includes(chip.id) ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    <div className={`rounded-xl border p-3 ${executionModel.confidence < 0.5 ? 'border-amber-700 bg-amber-950/40' : 'border-gray-800 bg-gray-900/60'}`}>
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-300">
                                {recommendationLanguage === 'es' ? 'Modelo de ejecución' : 'Execution model'}
                            </h3>
                            <span className={`text-[10px] font-black ${executionModel.confidence < 0.5 ? 'text-amber-300' : 'text-[#3DCD58]'}`}>
                                {Math.round(executionModel.confidence * 100)}% · {executionModel.totalSamples} {recommendationLanguage === 'es' ? 'tareas cerradas' : 'closed tasks'}
                            </span>
                        </div>
                        <p className="mt-1 text-[10px] text-gray-500">
                            {recommendationLanguage === 'es'
                                ? 'Calculado con tus propios datos, sin IA ni servicios externos. Se envía en el prompt junto con la fórmula para estimar fechas.'
                                : 'Computed from your own data — no AI, no external service. It is sent in the prompt together with the formula used to estimate dates.'}
                        </p>

                        {executionModel.agendaAccuracy.blocksPlanned > 0 && (
                            <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950/60 p-2">
                                <p className="text-[10px] font-bold text-gray-300">
                                    {recommendationLanguage === 'es' ? 'Desviación medida contra tus agendas anteriores' : 'Measured deviation against your past agendas'}
                                </p>
                                <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                                    <li>• {recommendationLanguage === 'es'
                                        ? `${executionModel.agendaAccuracy.blocksWorked} de ${executionModel.agendaAccuracy.blocksPlanned} bloques agendados tuvieron trabajo real (${executionModel.agendaAccuracy.blocksSkipped} no se trabajaron).`
                                        : `${executionModel.agendaAccuracy.blocksWorked} of ${executionModel.agendaAccuracy.blocksPlanned} planned blocks had real work (${executionModel.agendaAccuracy.blocksSkipped} were never worked).`}</li>
                                    <li>• {recommendationLanguage === 'es'
                                        ? `Planeaste ${executionModel.agendaAccuracy.plannedHours}h y registraste ${executionModel.agendaAccuracy.loggedHours}h.`
                                        : `You planned ${executionModel.agendaAccuracy.plannedHours}h and logged ${executionModel.agendaAccuracy.loggedHours}h.`}</li>
                                    {executionModel.agendaAccuracy.effortRatio !== null && (
                                        <li className={executionModel.agendaAccuracy.effortRatio > 1 ? 'text-amber-300' : 'text-[#3DCD58]'}>
                                            • {recommendationLanguage === 'es'
                                                ? `Factor de desviación x${executionModel.agendaAccuracy.effortRatio}: una hora planeada te ha costado ${executionModel.agendaAccuracy.effortRatio}h reales. Las estimaciones ya se multiplican por este factor.`
                                                : `Deviation factor x${executionModel.agendaAccuracy.effortRatio}: one planned hour has really cost ${executionModel.agendaAccuracy.effortRatio}h. Estimates are already multiplied by it.`}
                                        </li>
                                    )}
                                    {executionModel.agendaAccuracy.medianStartDelayDays !== null && (
                                        <li>• {recommendationLanguage === 'es'
                                            ? `Empiezas una tarea ${executionModel.agendaAccuracy.medianStartDelayDays} día(s) después de agendarla, mediana.`
                                            : `You start a task ${executionModel.agendaAccuracy.medianStartDelayDays} day(s) after planning it, median.`}</li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {executionModel.confidence < 0.5 && (
                            <div className="mt-2 rounded-lg border border-amber-700/60 bg-amber-950/40 p-2">
                                <p className="text-[10px] font-bold text-amber-200">
                                    {recommendationLanguage === 'es'
                                        ? 'Pocos datos: actualiza tus expedientes para que las fechas sean confiables.'
                                        : 'Thin data: update your expedientes so the dates become reliable.'}
                                </p>
                                <ul className="mt-1 space-y-0.5">
                                    {executionModel.gaps.slice(0, 4).map(gap => (
                                        <li key={gap} className="text-[10px] text-amber-200/80">• {gap}</li>
                                    ))}
                                </ul>
                                <p className="mt-1 text-[10px] text-amber-200/60">
                                    {recommendationLanguage === 'es'
                                        ? 'Aun así se genera el plan: el prompt le pide apoyarse en tus notas e historial y marcar cada supuesto.'
                                        : 'The plan is still generated: the prompt asks it to lean on your notes and history and to flag every assumption.'}
                                </p>
                            </div>
                        )}

                        {atRiskTasks.length > 0 && (
                            <div className="mt-2 rounded-lg border border-rose-800/60 bg-rose-950/30 p-2">
                                <p className="text-[10px] font-bold text-rose-200">
                                    {recommendationLanguage === 'es'
                                        ? `${atRiskTasks.length} tarea(s) no llegan a su fecha según el modelo:`
                                        : `${atRiskTasks.length} task(s) will not meet their due date according to the model:`}
                                </p>
                                <ul className="mt-1 space-y-0.5">
                                    {atRiskTasks.slice(0, 6).map(item => (
                                        <li key={item.task.id} className="text-[10px] text-rose-200/85" title={item.forecast.basis}>
                                            • {item.oppLabel} — {item.task.title}: {item.task.dueDate} → <span className="font-bold">{item.forecast.suggestedDueDate}</span>
                                        </li>
                                    ))}
                                </ul>
                                {atRiskTasks.length > 6 && (
                                    <p className="mt-1 text-[10px] text-rose-200/60">
                                        {recommendationLanguage === 'es' ? `y ${atRiskTasks.length - 6} más…` : `and ${atRiskTasks.length - 6} more…`}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-gray-300">
                            <input
                                type="checkbox"
                                checked={focusPolicy.enabled}
                                onChange={(e) => updateFocusPolicy({ enabled: e.target.checked })}
                                className="rounded border-gray-600 bg-gray-800 text-[#3DCD58] focus:ring-[#3DCD58]"
                            />
                            {recommendationLanguage === 'es' ? 'Concentración y descansos automáticos' : 'Focus sessions and automatic breaks'}
                        </label>
                        <p className="mt-1 text-[10px] text-gray-500">
                            {recommendationLanguage === 'es'
                                ? 'Los descansos son huecos entre bloques, no tareas. El tope diario se respeta aunque tengas más disponibilidad.'
                                : 'Breaks are gaps between blocks, never tasks. The daily cap holds even when more availability is free.'}
                        </p>
                        {focusPolicy.enabled && (
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black uppercase text-gray-500">{recommendationLanguage === 'es' ? 'Bloque máx (min)' : 'Max block (min)'}</span>
                                    <input type="number" min={15} max={240} step={5} value={focusPolicy.sessionMinutes} onChange={(e) => updateFocusPolicy({ sessionMinutes: Math.max(15, Number(e.target.value) || 0) })} className={inputCls} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black uppercase text-gray-500">{recommendationLanguage === 'es' ? 'Descanso (min)' : 'Break (min)'}</span>
                                    <input type="number" min={0} max={120} step={5} value={focusPolicy.breakMinutes} onChange={(e) => updateFocusPolicy({ breakMinutes: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black uppercase text-gray-500">{recommendationLanguage === 'es' ? 'Bloques p/ pausa larga' : 'Blocks per long break'}</span>
                                    <input type="number" min={1} max={10} value={focusPolicy.longBreakAfterSessions} onChange={(e) => updateFocusPolicy({ longBreakAfterSessions: Math.max(1, Number(e.target.value) || 1) })} className={inputCls} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black uppercase text-gray-500">{recommendationLanguage === 'es' ? 'Pausa larga (min)' : 'Long break (min)'}</span>
                                    <input type="number" min={0} max={180} step={5} value={focusPolicy.longBreakMinutes} onChange={(e) => updateFocusPolicy({ longBreakMinutes: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black uppercase text-gray-500">{recommendationLanguage === 'es' ? 'Máx horas/día' : 'Max hours/day'}</span>
                                    <input type="number" min={1} max={12} step={0.5} value={focusPolicy.maxDailyFocusHours} onChange={(e) => updateFocusPolicy({ maxDailyFocusHours: Math.max(1, Number(e.target.value) || 1) })} className={inputCls} />
                                </label>
                            </div>
                        )}
                    </div>
                </section>

                {/* Step 2: prompt */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{recommendationLanguage === 'es' ? '4. Copia este prompt en tu chat de IA' : '4. Copy this prompt into your AI chat'}</h2>
                        <div className="flex items-center gap-2">
                            {promptDirty && (
                                <button onClick={() => { setPromptDirty(false); setPrompt(generatedPrompt); }} className="text-[11px] font-bold text-gray-400 hover:text-gray-200">
                                    {recommendationLanguage === 'es' ? 'Regenerar' : 'Regenerate'}
                                </button>
                            )}
                            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] transition-colors">
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? (recommendationLanguage === 'es' ? 'Copiado' : 'Copied') : (recommendationLanguage === 'es' ? 'Copiar prompt' : 'Copy Prompt')}
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={prompt}
                        onChange={e => { setPrompt(e.target.value); setPromptDirty(true); }}
                        className={`${inputCls} h-56 font-mono text-[11px] leading-relaxed resize-y`}
                    />
                    <p className={`text-[10px] font-bold ${prompt.length > 32000 ? 'text-rose-400' : prompt.length > 24000 ? 'text-amber-400' : 'text-gray-500'}`}>
                        {(prompt.length / 1000).toFixed(1)}k characters
                        {prompt.length > 32000
                            ? (recommendationLanguage === 'es'
                                ? ' — demasiado largo para pegarlo. Quita oportunidades o días hasta que baje.'
                                : ' — too long to paste. Deselect opportunities or days until it shrinks.')
                            : prompt.length > 24000
                                ? (recommendationLanguage === 'es'
                                    ? ' — puede exceder el límite del Copilot gratuito. M365 Copilot lo acepta; si no, quita alguna oportunidad.'
                                    : ' — may exceed the free Copilot paste limit. M365 Copilot accepts it; otherwise deselect an opportunity.')
                                : (recommendationLanguage === 'es'
                                    ? ' — cabe en Copilot. Unos 19k son las reglas fijas del prompt; el resto son tus datos.'
                                    : ' — fits in Copilot. About 19k of it is the fixed rule set; the rest is your data.')}
                    </p>
                </section>

                {/* Step 3: paste response */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{recommendationLanguage === 'es' ? '5. Pega la respuesta de la IA' : "5. Paste the AI's reply"}</h2>
                    <textarea
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        placeholder={recommendationLanguage === 'es' ? 'Pega aquí la respuesta completa; debe incluir la tabla ### SCHEDULE.' : 'Paste the full AI reply here; it must include the ### SCHEDULE table.'}
                        className={`${inputCls} h-40 font-mono text-[11px] resize-y`}
                    />
                    <button
                        onClick={handleParse}
                        disabled={!pasteText.trim()}
                        className="px-3 py-1.5 text-xs font-bold bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Bot className="w-4 h-4 inline mr-1.5" /> {recommendationLanguage === 'es' ? 'Revisar plan de IA' : 'Review AI plan'}
                    </button>
                </section>

                {/* Draft/applied status — full editing happens in the dedicated review workspace. */}
                {(applied || scheduleRows.length > 0 || reminderRows.length > 0 || dueDateRows.length > 0 || deliveryDateRows.length > 0 || parseErrors.length > 0) && (
                    <section className={`rounded-2xl p-4 flex items-center justify-between gap-3 border ${applied ? 'bg-emerald-950/30 border-[#3DCD58]/50' : 'bg-gray-900 border-gray-800'}`}>
                        <div className="min-w-0">
                            {applied ? (
                                <p className="text-sm font-bold text-[#3DCD58] flex items-center gap-2"><Check className="w-4 h-4 shrink-0" /> Plan applied — execution blocks, due dates and reminders were saved.</p>
                            ) : (
                                <p className="text-sm font-bold text-gray-200">
                                    Draft ready: {scheduleRows.length} session{scheduleRows.length === 1 ? '' : 's'} · {reminderRows.length} reminder{reminderRows.length === 1 ? '' : 's'} · {dueDateRows.length} due date{dueDateRows.length === 1 ? '' : 's'}{parseErrors.length ? ` · ${parseErrors.length} issue${parseErrors.length === 1 ? '' : 's'}` : ''}
                                </p>
                            )}
                            <p className="text-[11px] text-gray-500 mt-1">{applied ? 'Check the Schedule view and the reminders bell — everything is already there.' : 'Nothing is saved yet. Open the review workspace to edit and accept the plan.'}</p>
                        </div>
                        <button onClick={() => setPhase('review')} className="shrink-0 px-3 py-2 text-xs font-bold bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                            {applied ? 'Reopen review' : 'Open review'}
                        </button>
                    </section>
                )}
            </div>
        </div>
    );
};
