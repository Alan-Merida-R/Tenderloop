import React, { useEffect, useRef, useState } from 'react';
import { SOW_TEMPLATE_HTML } from '../services/sowTemplate';
import { Person, Task } from '../types';

interface Props {
    /** Serialized JSON state of the SOW form (MeetingNote.content when format === 'sow'), or '' if never filled in yet. */
    content: string;
    onChange: (json: string) => void;
    people?: Person[];
    tasks?: Task[];
    areas?: string[];
    /** Opportunity values used to start a new SOW without retyping its basic data. */
    prefill?: Record<string, string>;
    globalForm?: { sections: any[]; questions: any[] };
    onGlobalFormChange?: (form: { sections: any[]; questions: any[] }) => void;
    /** User-editable Scope / System / Notes-at-a-glance option lists (Settings → Labels & Scope). */
    scopeCatalog?: unknown;
    onOpportunitySync?: (fields: Record<string, unknown>) => void;
    onGeneratedNote?: (note: { title?: string; content?: string }) => void;
    onQuickLinkRequest?: (link: { label: string; url: string }) => void;
    onTaskOpen?: (taskId: string) => void;
    onTaskConvert?: (taskId: string) => void;
    onTaskRaciUpdate?: (patch: { taskId: string; responsibleTeamMemberIds: string[]; approverTeamMemberIds: string[]; informedTeamMemberIds: string[] }) => void;
    onTaskCreate?: (task: { title: string; description: string; priority: Task['priority']; dueDate: string; responsibleRequestedDate: string; responsibleDueDate: string; responsibleTeamMemberIds: string[]; approverTeamMemberIds: string[]; informedTeamMemberIds: string[] }) => void;
    onStakeholderCreate?: (stakeholder: { name: string; email: string; role: string }) => void;
    /** Contacts from the shared directory, used by the SOW seller autocomplete. */
    directoryPeople?: Person[];
    onSellerMissing?: (name: string) => void;
    disabled?: boolean;
    /** Called when the SOW's own in-document search/navigation panel opens or closes, so the host can free up space for it (e.g. hide the notes list) instead of letting it overlap content. */
    onNavigationOpenChange?: (open: boolean) => void;
    /**
     * localStorage key for this note's crash backup. Must be note-scoped: an opportunity-scoped
     * key made a second (empty) SOW note load the first one's answers and save them as its own,
     * which is how duplicate SOWs appeared in Notes.
     */
    backupKey?: string;
    /**
     * Opportunity-scoped key written before backups became note-scoped. Only passed for the
     * opportunity's primary SOW note, and only read when that note has no content of its own.
     */
    legacyBackupKey?: string;
}

/**
 * Renders the Scope of Work guided-builder as a sandboxed iframe, one instance per note.
 * The iframe has no persistent storage of its own (sandbox without allow-same-origin),
 * so state travels over postMessage: the iframe announces 'ready', the host replies
 * with 'init' + the note's saved JSON, and every subsequent edit inside the iframe is
 * reported back via 'save' so it can be written into that note's content field. This
 * keeps each opportunity's SOW form fully isolated from every other opportunity's.
 */
export const SowFormEmbed: React.FC<Props> = ({ content, onChange, people = [], tasks = [], directoryPeople = [], areas = [], prefill = {}, globalForm = { sections: [], questions: [] }, scopeCatalog, onGlobalFormChange, onOpportunitySync, onGeneratedNote, onQuickLinkRequest, onTaskOpen, onTaskConvert, onTaskRaciUpdate, onTaskCreate, onStakeholderCreate, onSellerMissing, onNavigationOpenChange, backupKey, legacyBackupKey, disabled }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const overviewIframeRef = useRef<HTMLIFrameElement>(null);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const contentRef = useRef(content);
    const onChangeRef = useRef(onChange);
    const peopleRef = useRef(people);
    const tasksRef = useRef(tasks);
    const directoryPeopleRef = useRef(directoryPeople);
    const areasRef = useRef(areas);
    const prefillRef = useRef(prefill);
    const globalFormRef = useRef(globalForm);
    const onGlobalFormChangeRef = useRef(onGlobalFormChange);
    const onOpportunitySyncRef = useRef(onOpportunitySync);
    const onGeneratedNoteRef = useRef(onGeneratedNote);
    const onQuickLinkRequestRef = useRef(onQuickLinkRequest);
    const onTaskOpenRef = useRef(onTaskOpen);
    const onTaskConvertRef = useRef(onTaskConvert);
    const onTaskRaciUpdateRef = useRef(onTaskRaciUpdate);
    const onTaskCreateRef = useRef(onTaskCreate);
    const onStakeholderCreateRef = useRef(onStakeholderCreate);
    const onSellerMissingRef = useRef(onSellerMissing);
    const onNavigationOpenChangeRef = useRef(onNavigationOpenChange);
    const lastPrefillSyncRef = useRef('');
    const scopeCatalogRef = useRef(scopeCatalog);
    // The exact JSON this iframe last sent us. `content` coming back identical is our own save
    // echoing through React state — pushing it back in would overwrite whatever was typed since.
    const lastFromIframeRef = useRef<string | null>(null);
    const backupKeyRef = useRef(backupKey);
    const legacyBackupKeyRef = useRef(legacyBackupKey);
    useEffect(() => { backupKeyRef.current = backupKey; }, [backupKey]);
    useEffect(() => { legacyBackupKeyRef.current = legacyBackupKey; }, [legacyBackupKey]);

    useEffect(() => { contentRef.current = content; }, [content]);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { peopleRef.current = people; }, [people]);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { directoryPeopleRef.current = directoryPeople; }, [directoryPeople]);
    useEffect(() => { areasRef.current = areas; }, [areas]);
    useEffect(() => { prefillRef.current = prefill; }, [prefill]);
    // Changes made from Overview's Scope panel update the saved SOW note without
    // remounting this iframe. Push the current answers back into the live form so
    // both views always show the same scope immediately.
    useEffect(() => {
        if (content === lastFromIframeRef.current) return;
        try {
            const parsed = content ? JSON.parse(content) : null;
            if (parsed?.fields) iframeRef.current?.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'update-fields', fields: parsed.fields }, '*');
        } catch { /* invalid/empty SOW content is initialized by the iframe */ }
    }, [content]);
    const scopeCatalogSignature = JSON.stringify(scopeCatalog ?? null);
    useEffect(() => {
        scopeCatalogRef.current = scopeCatalog;
        const message = { source: 'tenderloop-sow-host', type: 'update-scope-catalog', scopeCatalog };
        iframeRef.current?.contentWindow?.postMessage(message, '*');
        overviewIframeRef.current?.contentWindow?.postMessage(message, '*');
    }, [scopeCatalogSignature, scopeCatalog]);
    const prefillSignature = JSON.stringify(prefill);
    useEffect(() => {
        if (lastPrefillSyncRef.current === prefillSignature) return;
        lastPrefillSyncRef.current = prefillSignature;
        iframeRef.current?.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'update-prefill', prefill }, '*');
    }, [prefillSignature, prefill]);
    useEffect(() => { globalFormRef.current = globalForm; }, [globalForm]);
    useEffect(() => { onGlobalFormChangeRef.current = onGlobalFormChange; }, [onGlobalFormChange]);
    useEffect(() => { onOpportunitySyncRef.current = onOpportunitySync; }, [onOpportunitySync]);
    useEffect(() => { onGeneratedNoteRef.current = onGeneratedNote; }, [onGeneratedNote]);
    useEffect(() => { onQuickLinkRequestRef.current = onQuickLinkRequest; }, [onQuickLinkRequest]);
    useEffect(() => { onTaskOpenRef.current = onTaskOpen; }, [onTaskOpen]);
    useEffect(() => { onTaskConvertRef.current = onTaskConvert; }, [onTaskConvert]);
    useEffect(() => { onTaskRaciUpdateRef.current = onTaskRaciUpdate; }, [onTaskRaciUpdate]);
    useEffect(() => { onTaskCreateRef.current = onTaskCreate; }, [onTaskCreate]);
    useEffect(() => { onStakeholderCreateRef.current = onStakeholderCreate; }, [onStakeholderCreate]);
    useEffect(() => { onSellerMissingRef.current = onSellerMissing; }, [onSellerMissing]);
    useEffect(() => { onNavigationOpenChangeRef.current = onNavigationOpenChange; }, [onNavigationOpenChange]);
    useEffect(() => {
        const message = { source: 'tenderloop-sow-host', type: 'update-task-context', tasks, people };
        iframeRef.current?.contentWindow?.postMessage(message, '*');
        overviewIframeRef.current?.contentWindow?.postMessage(message, '*');
    }, [tasks, people]);
    useEffect(() => {
        if (!overviewOpen) return;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOverviewOpen(false); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [overviewOpen]);

    useEffect(() => {
        let sentInit = false;
        const onMessage = (e: MessageEvent) => {
            const isMainFrame = e.source === iframeRef.current?.contentWindow;
            const isOverviewFrame = e.source === overviewIframeRef.current?.contentWindow;
            if (!isMainFrame && !isOverviewFrame) return;
            const data = e.data;
            if (!data || data.source !== 'tenderloop-sow') return;
            if (data.type === 'ready' && !sentInit) {
                sentInit = true;
                let payload: any = null;
                try {
                    // Only fall back to a backup when this note is genuinely empty, and never to
                    // another note's backup — that is what used to clone the SOW.
                    const noteKey = backupKeyRef.current;
                    const legacyKey = legacyBackupKeyRef.current;
                    const backup = noteKey ? localStorage.getItem(noteKey) : null;
                    const source = contentRef.current || backup || (legacyKey ? localStorage.getItem(legacyKey) || '' : '');
                    payload = source ? JSON.parse(source) : null;
                } catch { payload = null; }
                iframeRef.current.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'init', payload, people: peopleRef.current, tasks: tasksRef.current, directoryPeople: directoryPeopleRef.current, areas: areasRef.current, prefill: prefillRef.current, globalForm: globalFormRef.current, scopeCatalog: scopeCatalogRef.current }, '*');
            } else if (data.type === 'ready' && isOverviewFrame) {
                let payload: any = null;
                try { payload = contentRef.current ? JSON.parse(contentRef.current) : null; } catch { payload = null; }
                overviewIframeRef.current?.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'init', payload, people: peopleRef.current, tasks: tasksRef.current, directoryPeople: directoryPeopleRef.current, areas: areasRef.current, prefill: prefillRef.current, globalForm: globalFormRef.current, scopeCatalog: scopeCatalogRef.current }, '*');
                overviewIframeRef.current?.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'open-overview' }, '*');
            } else if (data.type === 'save' && !disabled) {
                // Canonicalize the two representations used by the detailed SOW
                // and the Overview Scope button before persisting. This makes the
                // synchronization resilient even for older iframe state.
                if (data.payload?.fields) {
                    const fields = data.payload.fields;
                    // An empty included_scope is still a string, so a plain typeof check
                    // would let a blank detailed answer wipe out an existing scope_summary.
                    // Prefer whichever side actually has content.
                    const included = typeof fields.included_scope === 'string' ? fields.included_scope : '';
                    const summary = typeof fields.scope_summary === 'string' ? fields.scope_summary : '';
                    const scope = included.trim() ? included : summary;
                    fields.included_scope = scope;
                    fields.scope_summary = scope;
                }
                // This timestamp also identifies the canonical SOW when an older opportunity
                // still contains duplicate SOW notes. Refresh it on every form edit so reopening
                // Scope cannot jump back to a stale duplicate with more populated fields.
                data.payload.savedAt = new Date().toISOString();
                const serialized = JSON.stringify(data.payload);
                try { if (backupKeyRef.current) localStorage.setItem(backupKeyRef.current, serialized); } catch { /* non-critical backup */ }
                if (isMainFrame) lastFromIframeRef.current = serialized;
                onChangeRef.current(serialized);
            } else if (data.type === 'global-form-save' && !disabled && data.payload) {
                onGlobalFormChangeRef.current?.(data.payload);
            } else if (data.type === 'sync-opportunity' && !disabled && data.payload) {
                onOpportunitySyncRef.current?.(data.payload);
            } else if (data.type === 'generated-note' && !disabled && data.payload) {
                onGeneratedNoteRef.current?.(data.payload);
            } else if (data.type === 'add-quick-link' && !disabled && data.payload?.url) {
                onQuickLinkRequestRef.current?.({ label: String(data.payload.label || 'SOW link'), url: String(data.payload.url) });
            } else if (data.type === 'open-link' && data.url) {
                window.open(String(data.url), '_blank', 'noopener,noreferrer');
            } else if (data.type === 'open-task' && data.taskId) {
                onTaskOpenRef.current?.(String(data.taskId));
            } else if (data.type === 'convert-task-assignment' && !disabled && data.taskId) {
                onTaskConvertRef.current?.(String(data.taskId));
            } else if (data.type === 'update-task-raci' && !disabled && data.payload?.taskId) {
                onTaskRaciUpdateRef.current?.(data.payload);
            } else if (data.type === 'create-task' && !disabled && data.payload?.title) {
                onTaskCreateRef.current?.(data.payload);
            } else if (data.type === 'create-stakeholder' && !disabled && data.payload?.name) {
                onStakeholderCreateRef.current?.(data.payload);
            } else if (data.type === 'seller-contact-missing' && !disabled && data.name) {
                onSellerMissingRef.current?.(String(data.name));
            } else if (data.type === 'overview-open') {
                setOverviewOpen(true);
            } else if (data.type === 'overview-close') {
                setOverviewOpen(false);
            } else if (data.type === 'navigation-open' && isMainFrame) {
                onNavigationOpenChangeRef.current?.(true);
            } else if (data.type === 'navigation-close' && isMainFrame) {
                onNavigationOpenChangeRef.current?.(false);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [disabled]);

    useEffect(() => () => onNavigationOpenChangeRef.current?.(false), []);

    return (
        <>
        <iframe
            ref={iframeRef}
            title="Scope of Work"
            srcDoc={SOW_TEMPLATE_HTML}
            sandbox="allow-scripts allow-modals allow-forms allow-downloads"
            /* No min-height: the form scrolls inside the iframe, so anything taller than the
               pane it sits in gets clipped by the parent's overflow-hidden — which is how the
               last question became unreachable whenever a linked-task panel shortened the pane. */
            className="flex-1 h-full min-h-0 w-full border-none bg-white"
        />
        {overviewOpen && <>
            <button aria-label="Close Overview" className="fixed inset-0 z-[89] cursor-default bg-transparent" onClick={() => setOverviewOpen(false)} />
            <iframe
                ref={overviewIframeRef}
                title="SOW Overview"
                srcDoc={SOW_TEMPLATE_HTML}
                sandbox="allow-scripts allow-modals allow-forms allow-downloads"
                className="fixed right-0 top-0 z-[90] h-screen w-[min(760px,65vw)] border-none bg-white shadow-[-18px_0_42px_rgba(0,0,0,0.32)] max-md:w-screen"
            />
        </>}
        </>
    );
};
