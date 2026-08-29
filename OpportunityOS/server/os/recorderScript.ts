// The recorder overlay. Like pageScripts.ts, this does NOT run in Node:
// Playwright injects its source into every document of the recording session,
// so it must be self-contained and use only plain browser JS.
//
// It teaches a recipe by watching. The user browses bFO exactly as they always
// do; the overlay records the clicks and lets them point at the values that
// matter. Nothing is ever typed or submitted from here.

declare const document: any;
declare const window: any;

/** One app field that a pointed-at value can be tagged as. */
export interface RecorderField {
    key: string;
    label: string;
}

export interface RecorderConfig {
    fields: RecorderField[];
    /** Panel copy, passed in rather than hardcoded so it stays translatable. */
    strings: {
        title: string;
        navigate: string;
        capture: string;
        finish: string;
        pickPrompt: string;
        cancel: string;
        steps: string;
    };
}

/**
 * Install the overlay.
 *
 * Safe to call repeatedly: Playwright re-injects init scripts on every
 * navigation, and some Lightning views swap the whole body, so this runs many
 * times per session and must no-op after the first.
 */
export function installRecorder(config: RecorderConfig): void {
    if (window.__oosRecorderInstalled) return;
    // Init scripts land in every document, including the about:blank a fresh
    // context starts on. There is nothing to record there.
    if (!window.location || /^about:/.test(String(window.location.href))) return;
    window.__oosRecorderInstalled = true;

    var HOST_ID = 'oos-recorder-host';
    var mode = 'navigate';   // 'navigate' | 'capture'
    var pending: any = null; // element awaiting a field tag
    var stepCount = 0;

    var send = function (payload: any) {
        try {
            if (window.__oosRecord) window.__oosRecord(payload);
        } catch (e) { /* binding not ready yet: the step is simply not recorded */ }
    };

    var clean = function (s: any) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    };

    /** Raw attributes only — buildSelector() in Node decides which one wins. */
    var partsFor = function (el: any) {
        var holder = el.closest ? el.closest('[data-target-selection-name]') : null;
        var siblings = el.parentElement ? el.parentElement.children : [];
        var nth = 0;
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i] === el) break;
            if (siblings[i].tagName === el.tagName) nth++;
        }
        return {
            tag: el.tagName.toLowerCase(),
            apiName: holder ? clean(holder.getAttribute('data-target-selection-name')) : undefined,
            name: clean(el.getAttribute('name')) || undefined,
            id: clean(el.id) || undefined,
            ariaLabel: clean(el.getAttribute('aria-label')) || undefined,
            nth: nth
        };
    };

    /** The label bFO shows for the field this element belongs to, if any. */
    var labelFor = function (el: any) {
        var group = el.closest ? el.closest('.slds-form-element') : null;
        if (group) {
            var lbl = group.querySelector('.test-id__field-label, .slds-form-element__label, label');
            if (lbl) return clean(lbl.textContent);
        }
        return clean(el.getAttribute('aria-label') || el.getAttribute('title') || '');
    };

    /**
     * Everything below touches the DOM, and init scripts run at document_start
     * — before the parser has produced even an <html> element, so
     * `document.documentElement` is still null at this point.
     */
    var install = function () {
        // --- Panel --------------------------------------------------------
        // A shadow root keeps Lightning's very assertive CSS from restyling the
        // panel, and keeps the panel's own styles from leaking onto the page.
        var host = document.createElement('div');
        host.id = HOST_ID;
        host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
        var root = host.attachShadow({ mode: 'open' });
        document.documentElement.appendChild(host);

        var css = '.p{font:13px system-ui,sans-serif;background:#111;color:#fff;border-radius:10px;'
            + 'padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.35);width:250px}'
            + '.t{font-weight:700;margin-bottom:8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase}'
            + 'button{font:12px system-ui,sans-serif;border:0;border-radius:6px;padding:6px 9px;'
            + 'margin:0 4px 4px 0;cursor:pointer;background:#333;color:#fff}'
            + 'button.on{background:#3DCD58;color:#062}'
            + 'button.fin{background:#fff;color:#111;font-weight:700}'
            + '.s{opacity:.7;font-size:11px;margin-top:6px}'
            + '.f{display:block;width:100%;text-align:left;margin:2px 0;background:#222}';

        root.innerHTML = '<style>' + css + '</style>'
            + '<div class="p">'
            + '<div class="t"></div>'
            + '<div id="modes">'
            + '<button id="nav" class="on"></button>'
            + '<button id="cap"></button>'
            + '<button id="fin" class="fin"></button>'
            + '</div>'
            + '<div id="picker" style="display:none"></div>'
            + '<div class="s" id="status"></div>'
            + '</div>';

        var $ = function (id: string) { return root.getElementById(id); };
        // Copy is set as text, never as HTML, so a label can never inject markup.
        root.querySelector('.t').textContent = config.strings.title;
        $('nav').textContent = config.strings.navigate;
        $('cap').textContent = config.strings.capture;
        $('fin').textContent = config.strings.finish;

        var statusEl = $('status');
        var pickerEl = $('picker');
        var modesEl = $('modes');

        var refresh = function () {
            statusEl.textContent = config.strings.steps.replace('{n}', String(stepCount));
            $('nav').className = mode === 'navigate' ? 'on' : '';
            $('cap').className = mode === 'capture' ? 'on' : '';
        };

        var setMode = function (next: string) {
            mode = next;
            pending = null;
            pickerEl.style.display = 'none';
            modesEl.style.display = '';
            refresh();
        };

        $('nav').onclick = function () { setMode('navigate'); };
        $('cap').onclick = function () { setMode('capture'); };
        $('fin').onclick = function () { send({ kind: 'finish' }); };

        /** Offer the app fields once an element has been pointed at. */
        var openPicker = function (el: any) {
            pending = el;
            modesEl.style.display = 'none';
            pickerEl.style.display = '';
            pickerEl.innerHTML = '';

            var prompt = document.createElement('div');
            prompt.className = 's';
            prompt.textContent = config.strings.pickPrompt;
            pickerEl.appendChild(prompt);

            var choose = function (key: string) {
                return function () {
                    if (key && pending) {
                        stepCount++;
                        send({
                            kind: 'capture',
                            field: key,
                            url: String(window.location.href),
                            label: labelFor(pending),
                            text: clean(pending.textContent).slice(0, 200),
                            target: partsFor(pending)
                        });
                    }
                    setMode('capture');
                };
            };

            for (var i = 0; i < config.fields.length; i++) {
                var b = document.createElement('button');
                b.className = 'f';
                b.textContent = config.fields[i].label;
                b.onclick = choose(config.fields[i].key);
                pickerEl.appendChild(b);
            }
            var cancel = document.createElement('button');
            cancel.className = 'f';
            cancel.textContent = config.strings.cancel;
            cancel.onclick = choose('');
            pickerEl.appendChild(cancel);
        };

        // --- Listening ----------------------------------------------------

        /** True for the overlay itself, whose own clicks must never be recorded. */
        var inPanel = function (el: any) {
            if (!el) return false;
            if (el === host) return true;
            return !!(el.closest && el.closest('#' + HOST_ID));
        };

        var highlighted: any = null;
        var unhighlight = function () {
            if (!highlighted) return;
            highlighted.style.outline = highlighted.__oosPrevOutline || '';
            highlighted = null;
        };

        document.addEventListener('mouseover', function (e: any) {
            if (mode !== 'capture' || inPanel(e.target)) return;
            unhighlight();
            highlighted = e.target;
            highlighted.__oosPrevOutline = highlighted.style.outline;
            highlighted.style.outline = '2px solid #3DCD58';
        }, true);

        document.addEventListener('click', function (e: any) {
            if (inPanel(e.target)) return;

            if (mode === 'capture') {
                // Swallow the click: pointing at a link must not navigate away.
                e.preventDefault();
                e.stopPropagation();
                unhighlight();
                openPicker(e.target);
                return;
            }

            // Navigate mode: record what was clicked, then let the page react
            // normally so the user keeps browsing exactly as they always do.
            stepCount++;
            send({
                kind: 'click',
                url: String(window.location.href),
                label: labelFor(e.target),
                text: clean(e.target.textContent).slice(0, 120),
                target: partsFor(e.target)
            });
            refresh();
        }, true);

        send({ kind: 'navigate', url: String(window.location.href), label: clean(document.title) });
        refresh();
    };

    if (document.documentElement && document.body) {
        install();
    } else {
        document.addEventListener('DOMContentLoaded', install);
    }
}
