// Extraction that runs INSIDE a bFO page. Like the other page scripts, this is
// serialized by Playwright and evaluated in the browser, so it must be
// self-contained plain JS.
//
// It finds values by what they ARE — Salesforce field API name, link href
// pattern, or Salesforce's own CSS class — never by replaying a click path.
// That is what makes one recipe work for every opportunity: the record changes,
// the field's identity does not.

declare const document: any;
declare const window: any;

export interface ReadResult {
    /** value keyed by field api-name fragment, e.g. "Opportunity.Amount" */
    byApiName: Record<string, string>;
    /** first href matching each requested object type, e.g. Account -> "/lightning/r/Account/001.../view" */
    links: Record<string, string>;
    /** Address lines, from Salesforce's own address component. */
    addressLines: string[];
    /** Label -> value for everything readable, as a fallback when an api name misses. */
    byLabel: Record<string, string>;
    title: string;
    url: string;
    looksLikeLogin: boolean;
    /**
     * How many elements each layer saw. When a value comes back empty this is
     * what says WHY: zero holders means the fields had not rendered (or are not
     * marked the way we expect), while holders>0 with empty values means the
     * value selectors are wrong. Guessing between those two without numbers
     * wastes a round trip to the work computer.
     */
    counts: {
        apiHolders: number;
        formGroups: number;
        anchors: number;
        addressEls: number;
        shadowRoots: number;
        iframes: number;
    };
}

/**
 * Read one bFO page.
 *
 * Lightning nests fields inside shadow roots, and `querySelectorAll` does not
 * cross those boundaries — so every lookup here walks shadow roots explicitly.
 * This is the same reason a naive click recorder saw nothing but the outermost
 * container: to the outside world, a shadow root is opaque.
 */
export function readBfoPage(): ReadResult {
    var clean = function (s: any) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    };

    /** Collect every element matching `sel`, descending through shadow roots. */
    var deepQueryAll = function (sel: string): any[] {
        var found: any[] = [];
        var seen: any[] = [];
        var visit = function (root: any, depth: number) {
            if (!root || depth > 25) return;
            for (var s = 0; s < seen.length; s++) if (seen[s] === root) return;
            seen.push(root);
            var matches: any[] = [];
            try { matches = Array.prototype.slice.call(root.querySelectorAll(sel)); } catch (e) { matches = []; }
            for (var m = 0; m < matches.length; m++) found.push(matches[m]);
            var all: any[] = [];
            try { all = Array.prototype.slice.call(root.querySelectorAll('*')); } catch (e) { all = []; }
            for (var i = 0; i < all.length; i++) {
                if (all[i].shadowRoot) visit(all[i].shadowRoot, depth + 1);
            }
        };
        visit(document, 0);
        return found;
    };

    /** Try selectors in priority order; a comma list would return document order. */
    var firstIn = function (root: any, selectors: string[]): any {
        for (var i = 0; i < selectors.length; i++) {
            var hit = null;
            try { hit = root.querySelector(selectors[i]); } catch (e) { hit = null; }
            if (hit) return hit;
        }
        return null;
    };

    var byApiName: Record<string, string> = {};
    var byLabel: Record<string, string> = {};

    // Every record field Lightning renders carries its API name here.
    var holders = deepQueryAll('[data-target-selection-name]');
    for (var h = 0; h < holders.length; h++) {
        var holder = holders[h];
        var api = clean(holder.getAttribute('data-target-selection-name'));
        // "sfdc:RecordField.Opportunity.Amount" -> "Opportunity.Amount"
        var short = api.replace(/^sfdc:RecordField\./, '');

        var valueEl = firstIn(holder, [
            '[data-output-element-id="output-field"]',
            '.test-id__field-value',
            '.slds-form-element__static',
            'lightning-formatted-text',
        ]);
        var labelEl = firstIn(holder, ['.test-id__field-label', '.slds-form-element__label', 'label']);

        var value = valueEl ? clean(valueEl.textContent) : '';
        var label = labelEl ? clean(labelEl.textContent) : '';
        // An input in edit mode carries its value as a property, not as text.
        if (!value && valueEl && typeof valueEl.value === 'string') value = clean(valueEl.value);

        if (short && value && !byApiName[short]) byApiName[short] = value;
        if (label && value && !byLabel[label]) byLabel[label] = value;
    }

    // Label/value pairs outside the API-name wrappers, as a safety net.
    var groups = deepQueryAll('.slds-form-element');
    for (var g = 0; g < groups.length; g++) {
        var lbl = firstIn(groups[g], ['.test-id__field-label', '.slds-form-element__label', 'label']);
        var val = firstIn(groups[g], [
            '[data-output-element-id="output-field"]',
            '.test-id__field-value',
            '.slds-form-element__static',
        ]);
        if (!lbl || !val) continue;
        var l2 = clean(lbl.textContent).replace(/[:*]\s*$/, '');
        var v2 = clean(val.textContent);
        if (l2 && v2 && l2 !== v2 && !byLabel[l2]) byLabel[l2] = v2;
    }

    // Record links, by object type. This is how the SR hands over the
    // Opportunity and Account ids without any navigation at all.
    var links: Record<string, string> = {};
    var anchors = deepQueryAll('a[href]');
    for (var a = 0; a < anchors.length; a++) {
        var href = String(anchors[a].getAttribute('href') || '');
        var match = href.match(/\/lightning\/r\/([A-Za-z_0-9]+)\/([A-Za-z0-9]{15,18})\//);
        if (match && !links[match[1]]) links[match[1]] = href;
    }

    // The address, via Salesforce's own class — the one detail worth keeping
    // from the VBA/Selenium macro that did this before.
    var addressLines: string[] = [];
    var addrEls = deepQueryAll('.forceOutputAddressText, lightning-formatted-address, .slds-form-element__static address');
    for (var x = 0; x < addrEls.length && addressLines.length < 6; x++) {
        var line = clean(addrEls[x].textContent);
        if (line) addressLines.push(line);
    }

    var bodyText = clean(document.body ? document.body.innerText : '').toLowerCase();

    // Count open shadow roots so a page that hides everything behind closed
    // roots is distinguishable from one that simply has not rendered yet.
    var shadowRoots = 0;
    var allEls = deepQueryAll('*');
    for (var q = 0; q < allEls.length; q++) if (allEls[q].shadowRoot) shadowRoots++;

    return {
        counts: {
            apiHolders: holders.length,
            formGroups: groups.length,
            anchors: anchors.length,
            addressEls: addrEls.length,
            shadowRoots: shadowRoots,
            iframes: deepQueryAll('iframe').length,
        },
        byApiName: byApiName,
        links: links,
        addressLines: addressLines,
        byLabel: byLabel,
        title: clean(document.title),
        url: String(window.location.href),
        looksLikeLogin: !!deepQueryAll('input[type="password"]').length
            || /sign in|log in|iniciar sesi|single sign|authenticat/.test(bodyText.slice(0, 600)),
    };
}
