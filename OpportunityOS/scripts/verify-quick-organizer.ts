/** Contract checks for the TA6 Quick Organizer response format. */
import assert from 'node:assert/strict';
import { parseOrganizerResponse } from '../src/features/quickOrganizer/responseParser';
import { buildOrganizerPrompt } from '../src/features/quickOrganizer/promptBuilder';

const opportunity = {
    id: 'OP-1', title: 'North Plant', alias: 'NP', dates: { expected: '2026-09-25' },
    tasks: [{ id: 'TASK-1', title: 'Build BOM', status: 'Pending', dueDate: '2026-09-24' }],
} as any;

const response = `### META
schemaVersion | generatedAt | opportunityCount | taskCount | overallConfidence
ta6.1 | 2026-09-23T09:00 | 1 | 1 | 82
### PRIORITY RANKING
Rank | OppId | Opportunity | Score | Bucket | Why
1 | OP-1 | NP | 82 | A | Closes proposal today
### SCHEDULE
Key | Opportunity | Task | Date(YYYY-MM-DD) | Start(HH:mm) | End(HH:mm) | Note
OP-1::TASK-1 | NP | Build BOM | 2026-09-23 | 09:00 | 10:00 | Finish pricing inputs
### SUGGESTED_MOVES
BlockId | Scope | Name | Action | CurrentDate | CurrentStart | CurrentEnd | NewDate | NewStart | NewEnd | Reason
OP-X::TASK-X::0 | out-of-scope | Admin | Move | 2026-09-23 | 09:00 | 10:00 | 2026-09-24 | 15:00 | 16:00 | Protect proposal block
### EXECUTION QUEUE
Pos | Key | Task | Subtask | EstMin | DependsOn | DoneWhen
1 | OP-1::TASK-1 | Build BOM | - | 60 | - | BOM uploaded
### CONTINGENT
Key | Opportunity | Task | Trigger | EstMin | Action
OP-1::TASK-1 | NP | Build BOM | CSE confirms price | 30 | Update BOM
### EXTERNAL PUSH
Key | Opportunity | Type | To | SendBy(HH:mm) | Message
OP-1::TASK-1 | NP | Ping | CSE | 09:30 | Confirm the price input please
### PROPOSED_DUE_DATES
Key | Opportunity | Task | DueDate(YYYY-MM-DD) | Rationale
OP-1::TASK-1 | NP | Build BOM | 2026-09-23 | Fits committed work block
### PROPOSED_DELIVERY_DATES
OppId | Opportunity | CurrentDelivery | ProposedDelivery(YYYY-MM-DD) | Rationale
OP-1 | NP | 2026-09-25 | 2026-09-26 | One extra validation day
### OUT_OF_SCOPE_ADVICE
Scope | Key | Name | CurrentDate | AdvisedDate | Reason
Task | OP-1::TASK-1 | Build BOM | 2026-09-23 | 2026-09-30 | Outside authorized horizon
### REMINDERS
Key | Opportunity | Task | RemindAt(YYYY-MM-DDTHH:mm) | Title
OP-1::TASK-1 | NP | Build BOM | 2026-09-23T08:30 | Check price response
### QUESTIONS
Num | Question | WhyItMatters | AssumedMeanwhile
1 | Is the price approved? | Changes delivery date | Assume no
### ASSUMPTIONS
- CSE responds today
`;

const parsed = parseOrganizerResponse(response, [opportunity], {
    dayWindows: { '2026-09-23': [{ start: '08:00', end: '17:00' }] },
});

assert.equal(parsed.errors.length, 0);
assert.equal(parsed.meta?.schemaVersion, 'ta6.1');
assert.equal(parsed.scheduleRows.length, 1);
assert.equal(parsed.dueDateRows[0].date, '2026-09-23');
assert.equal(parsed.deliveryDateRows[0].date, '2026-09-26');
assert.equal(parsed.rankingRows.length, 1);
assert.equal(parsed.suggestedMoveRows.length, 1);
assert.equal(parsed.queueRows[0].estMinutes, 60);
assert.equal(parsed.contingentRows.length, 1);
assert.equal(parsed.externalPushRows[0].type, 'Ping');
assert.equal(parsed.outOfScopeRows.length, 1);
assert.equal(parsed.reminderRows.length, 1);
assert.equal(parsed.questionRows[0].answer, '');
assert.deepEqual(parsed.assumptions, ['CSE responds today']);

const privacyPrompt = buildOrganizerPrompt([{
    ...opportunity,
    statusLabel: 'In Progress', detailedStatus: 'Working on it', priorityOrder: 1, quoteType: 'Firm', revision: 'R0',
    customer: 'North Plant', seller: 'Owner', notes: [], labels: [], history: [], commercial: { currency: 'USD', cqaOfficialSellPrice: 123456, deliveryCommitted: 'soft' },
    kpis: { proposalAmountUSD: 123456, dealProbability: 80, timeline: { receivedAt: '2026-09-20' } },
    stakeholders: [{ id: 'P1', name: 'Approver', email: 'approver@example.com', role: 'CSE', roles: ['CSE'] }],
} as any], {
    userName: 'Tender', extraInstructions: '', activeChipIds: [], todayStr: '2026-09-23',
    dayWindows: { '2026-09-23': [{ start: '08:00', end: '17:00' }] }, oppIds: ['OP-1'], recommendationLanguage: 'es',
});
assert.ok(privacyPrompt.includes('AGENDA PRESERVATION RULE'));
assert.ok(privacyPrompt.includes('Expediente rank:1'));
assert.ok(!privacyPrompt.includes('approver@example.com'));
assert.ok(!privacyPrompt.includes('123456'));

console.log('Quick Organizer TA6 response contract passed');
