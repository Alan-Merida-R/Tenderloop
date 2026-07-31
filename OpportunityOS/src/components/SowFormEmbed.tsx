import React, { useEffect, useRef, useState } from 'react';
import { SOW_TEMPLATE_HTML } from '../services/sowTemplate';
import { Person } from '../types';

interface Props {
    /** Serialized JSON state of the SOW form (MeetingNote.content when format === 'sow'), or '' if never filled in yet. */
    content: string;
    onChange: (json: string) => void;
    people?: Person[];
    areas?: string[];
    /** Opportunity values used to start a new SOW without retyping its basic data. */
    prefill?: Record<string, string>;
    globalForm?: { sections: any[]; questions: any[] };
    onGlobalFormChange?: (form: { sections: any[]; questions: any[] }) => void;
    onOpportunitySync?: (fields: Record<string, unknown>) => void;
    onGeneratedNote?: (note: { title?: string; content?: string }) => void;
    onQuickLinkRequest?: (link: { label: string; url: string }) => void;
    /** Contacts from the shared directory, used by the SOW seller autocomplete. */
    directoryPeople?: Person[];
    onSellerMissing?: (name: string) => void;
    disabled?: boolean;
    /** Called when the SOW's own in-document search/navigation panel opens or closes, so the host can free up space for it (e.g. hide the notes list) instead of letting it overlap content. */
    onNavigationOpenChange?: (open: boolean) => void;
}

/**
 * Renders the Scope of Work guided-builder as a sandboxed iframe, one instance per note.
 * The iframe has no persistent storage of its own (sandbox without allow-same-origin),
 * so state travels over postMessage: the iframe announces 'ready', the host replies
 * with 'init' + the note's saved JSON, and every subsequent edit inside the iframe is
 * reported back via 'save' so it can be written into that note's content field. This
 * keeps each opportunity's SOW form fully isolated from every other opportunity's.
 */
export const SowFormEmbed: React.FC<Props> = ({ content, onChange, people = [], directoryPeople = [], areas = [], prefill = {}, globalForm = { sections: [], questions: [] }, onGlobalFormChange, onOpportunitySync, onGeneratedNote, onQuickLinkRequest, onSellerMissing, onNavigationOpenChange, disabled }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const overviewIframeRef = useRef<HTMLIFrameElement>(null);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const contentRef = useRef(content);
    const onChangeRef = useRef(onChange);
    const peopleRef = useRef(people);
    const directoryPeopleRef = useRef(directoryPeople);
    const areasRef = useRef(areas);
    const prefillRef = useRef(prefill);
    const globalFormRef = useRef(globalForm);
    const onGlobalFormChangeRef = useRef(onGlobalFormChange);
    const onOpportunitySyncRef = useRef(onOpportunitySync);
    const onGeneratedNoteRef = useRef(onGeneratedNote);
    const onQuickLinkRequestRef = useRef(onQuickLinkRequest);
    const onSellerMissingRef = useRef(onSellerMissing);
    const onNavigationOpenChangeRef = useRef(onNavigationOpenChange);
    const lastPrefillSyncRef = useRef('');

    useEffect(() => { contentRef.current = content; }, [content]);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { peopleRef.current = people; }, [people]);
    useEffect(() => { directoryPeopleRef.current = directoryPeople; }, [directoryPeople]);
    useEffect(() => { areasRef.current = areas; }, [areas]);
    useEffect(() => { prefillRef.current = prefill; }, [prefill]);
    // Changes made from Overview's Scope panel update the saved SOW note without
    // remounting this iframe. Push the current answers back into the live form so
    // both views always show the same scope immediately.
    useEffect(() => {
        try {
            const parsed = content ? JSON.parse(content) : null;
            if (parsed?.fields) iframeRef.current?.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'update-fields', fields: parsed.fields }, '*');
        } catch { /* invalid/empty SOW content is initialized by the iframe */ }
    }, [content]);
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
    useEffect(() => { onSellerMissingRef.current = onSellerMissing; }, [onSellerMissing]);
    useEffect(() => { onNavigationOpenChangeRef.current = onNavigationOpenChange; }, [onNavigationOpenChange]);
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
                    const backupKey = `tenderloop-sow-backup-${prefillRef.current?.op_id || ''}`;
                    const source = contentRef.current || (prefillRef.current?.op_id ? localStorage.getItem(backupKey) || '' : '');
                    payload = source ? JSON.parse(source) : null;
                } catch { payload = null; }
                iframeRef.current.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'init', payload, people: peopleRef.current, directoryPeople: directoryPeopleRef.current, areas: areasRef.current, prefill: prefillRef.current, globalForm: globalFormRef.current }, '*');
            } else if (data.type === 'ready' && isOverviewFrame) {
                let payload: any = null;
                try { payload = contentRef.current ? JSON.parse(contentRef.current) : null; } catch { payload = null; }
                overviewIframeRef.current?.contentWindow?.postMessage({ source: 'tenderloop-sow-host', type: 'init', payload, people: peopleRef.current, directoryPeople: directoryPeopleRef.current, areas: areasRef.current, prefill: prefillRef.current, globalForm: globalFormRef.current }, '*');
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
                const serialized = JSON.stringify(data.payload);
                try { if (prefillRef.current?.op_id) localStorage.setItem(`tenderloop-sow-backup-${prefillRef.current.op_id}`, serialized); } catch { /* non-critical backup */ }
                onChangeRef.current(serialized);
            } else if (data.type === 'global-form-save' && !disabled && data.payload) {
                onGlobalFormChangeRef.current?.(data.payload);
            } else if (data.type === 'sync-opportunity' && !disabled && data.payload) {
                onOpportunitySyncRef.current?.(data.payload);
            } else if (data.type === 'generated-note' && !disabled && data.payload) {
                onGeneratedNoteRef.current?.(data.payload);
            } else if (data.type === 'add-quick-link' && !disabled && data.payload?.url) {
                onQuickLinkRequestRef.current?.({ label: String(data.payload.label || 'SOW link'), url: String(data.payload.url) });
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
            className="flex-1 h-full min-h-[calc(100vh-11rem)] w-full border-none bg-white"
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
