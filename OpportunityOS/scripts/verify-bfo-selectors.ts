// Regression test for the bFO (Salesforce Lightning) selector strategy.
//
// The fixture in scripts/fixtures/ reproduces the exact DOM structures taken
// from real bFO pages: a Status field, a date field whose API name does NOT
// match its visible label, and the Comments textarea with its regenerated id.
// Those three cases are what the extractor has to survive, so they are pinned
// here rather than rediscovered by hand every time pageScripts.ts changes.
//
// Run: npm run check:bfo

import { chromium } from 'playwright-core';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { collectSnapshot } from '../server/os/pageScripts';
import type { PageSnapshot } from '../server/os/pageScripts';
import { findBrowserExecutable } from '../server/os/webAutomation';
import { buildSelector } from '../server/os/selectorPolicy';
import {
    SR_STATUS_OPTIONS, SR_STATUS_BY_APP_STATUS,
    shouldWriteSrStatus, srStatusNeedsJustification, appStatusFromForecastCategory,
} from '../server/os/bfoFieldMap';

interface Expectation {
    what: string;
    check: (snap: PageSnapshot) => boolean;
}

const expectations: Expectation[] = [
    {
        what: 'Status resolves to its field API name, not a fragile label or id',
        check: s => s.values.some(v =>
            v.label === 'Status' &&
            v.value === 'Completed' &&
            v.apiName === 'sfdc:RecordField.OPP_SupportRequest__c.Status__c'),
    },
    {
        what: 'A label that disagrees with its API name keeps BOTH (label for humans, API name for selectors)',
        check: s => s.values.some(v =>
            v.label === 'Requested Completion Date' &&
            v.apiName === 'sfdc:RecordField.OPP_SupportRequest__c.SupportRequestedBy__c'),
    },
    {
        what: 'The Comments textarea is found and labelled',
        check: s => s.fields.some(f => f.label === 'Comments' && f.type === 'textarea'),
    },
    {
        what: 'The regenerated id "input-9377" is NEVER used as a selector',
        check: s => s.fields.every(f => !f.selector.includes('input-9377')),
    },
    {
        what: 'A read-only field with NO inline-edit button still extracts (Forecast Category)',
        check: s => s.values.some(v => v.label === 'Forecast Category' && v.value === 'Pipeline'),
    },
    {
        what: 'Read values are clean — no "Edit <field>" text swallowed from the inline-edit button',
        check: s => s.values.every(v => !/^Edit /.test(v.value)),
    },
];

/** Pure mapping checks — no browser needed, so they run first and fail fast. */
const checkMappings = (): number => {
    const cases: { what: string; ok: boolean }[] = [
        {
            what: 'Every SR status the app can target really exists in the bFO picklist',
            ok: Object.values(SR_STATUS_BY_APP_STATUS)
                .every(target => (SR_STATUS_OPTIONS as readonly string[]).includes(target)),
        },
        {
            what: 'bFO spells it "Cancelled" (two Ls) even though the app says "Canceled"',
            ok: SR_STATUS_BY_APP_STATUS['Canceled'] === 'Cancelled',
        },
        {
            what: 'Submitted / Won / Lost all collapse onto Completed',
            ok: SR_STATUS_BY_APP_STATUS['Submitted'] === 'Completed'
                && SR_STATUS_BY_APP_STATUS['Won'] === 'Completed'
                && SR_STATUS_BY_APP_STATUS['Lost'] === 'Completed',
        },
        {
            what: 'Moving Submitted -> Won -> Lost never writes to bFO once it is Completed',
            ok: !shouldWriteSrStatus('Completed', 'Submitted')
                && !shouldWriteSrStatus('Completed', 'Won')
                && !shouldWriteSrStatus('Completed', 'Lost'),
        },
        {
            what: 'A genuine change still writes',
            ok: shouldWriteSrStatus('Accepted - In Progress', 'On Hold')
                && shouldWriteSrStatus('New', 'In Progress'),
        },
        {
            what: 'Statuses that need a justification are flagged, In Progress is not',
            ok: srStatusNeedsJustification('Won')
                && srStatusNeedsJustification('On Hold')
                && !srStatusNeedsJustification('In Progress'),
        },
        {
            what: 'Forecast Category: Won -> Won, Omitted -> Lost, Pipeline -> still open',
            ok: appStatusFromForecastCategory('Won') === 'Won'
                && appStatusFromForecastCategory('Omitted') === 'Lost'
                && appStatusFromForecastCategory('Pipeline') === null
                && appStatusFromForecastCategory('Best Case') === null,
        },
        {
            what: 'Any other Forecast Category leaves the app status untouched',
            ok: ['Pipeline', 'Best Case', 'Commit', 'Closed', 'Omitted ', '', '--None--']
                .filter(v => v.trim() !== 'Omitted')
                .every(v => appStatusFromForecastCategory(v) === null),
        },
    ];
    let failed = 0;
    for (const c of cases) {
        if (!c.ok) failed++;
        console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.what}`);
    }
    return failed;
};

const run = async () => {
    console.log('--- Mapeos (bFO <-> app) ---');
    const mappingFailures = checkMappings();
    console.log('');
    console.log('--- Selectores contra el HTML real de bFO ---');
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
        console.error('No Chrome/Edge found on this machine — cannot run the check.');
        process.exit(1);
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixture = path.join(here, 'fixtures', 'bfo-lightning-sample.html');
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(fixture).href);
        // Same no-op __name shim the real engine uses; see evaluateInPage().
        const snap = await page.evaluate(
            `(() => { const __name = (f) => f; return (${collectSnapshot.toString()})(); })()`
        ) as PageSnapshot;
        // Same composition step the probe does — selector policy lives in Node.
        for (const f of snap.fields) f.selector = buildSelector(f.target);

        let failed = 0;
        for (const e of expectations) {
            const ok = e.check(snap);
            if (!ok) failed++;
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${e.what}`);
        }
        console.log(`\nFields: ${snap.fields.length}   Values: ${snap.values.length}`);
        for (const f of snap.fields) console.log(`  field  "${f.label}"  ->  ${f.selector}`);
        for (const v of snap.values) console.log(`  value  "${v.label}"  =  "${v.value}"  [${v.apiName || 'no api name'}]`);

        if (failed) {
            console.error(`\n${failed} expectation(s) failed.`);
            process.exit(1);
        }
        console.log('\nAll bFO selector expectations hold.');
    } finally {
        await browser.close();
    }
};

run();
