// The bFO (Salesforce) contract: picklist values spelled exactly as bFO spells
// them, and how they map to and from the app's own statuses.
//
// Everything here is plain data and pure functions on purpose — it is the part
// of the integration that can be checked without a browser, and the part most
// likely to be wrong in a way no type checker would catch (a missing "l" in
// "Cancelled" silently fails to match the dropdown option at runtime).
//
// Confirmed against real bFO screens on 2026-08-28. See docs/BFO_MAPA_CAMPOS.md.

import type { OpportunityStatus } from '../../src/types';

/** Every option in the SR `Status` picklist, in the order bFO lists them. */
export const SR_STATUS_OPTIONS = [
    '--None--',
    'New',
    'Submitted',
    'Accepted - Scheduled',
    'Accepted - In Progress',
    'Accepted - On Hold Back-Office',
    'Accepted - On Hold Front-Office',
    'Completed',
    'Cancelled',
    'Rejected',
] as const;

export type SrStatus = typeof SR_STATUS_OPTIONS[number];

/**
 * App status -> SR status. Several app statuses collapse onto 'Completed':
 * once the proposal work is done, bFO stops caring whether the deal was later
 * won or lost. `shouldWriteSrStatus` is what keeps that from causing churn.
 */
export const SR_STATUS_BY_APP_STATUS: Record<OpportunityStatus, SrStatus> = {
    'In Progress': 'Accepted - In Progress',
    'On Hold': 'Accepted - On Hold Back-Office',
    'Submitted': 'Completed',
    'Won': 'Completed',
    'Lost': 'Completed',
    'Canceled': 'Cancelled',
};

/**
 * Picking one of these makes bFO demand a justification in `Resolution
 * Comments` before it will save.
 */
export const SR_STATUS_NEEDS_JUSTIFICATION: ReadonlySet<string> = new Set<SrStatus>([
    'Accepted - On Hold Back-Office',
    'Accepted - On Hold Front-Office',
    'Completed',
    'Cancelled',
    'Rejected',
]);

/**
 * Whether the SR status is worth writing at all.
 *
 * Writing an identical value is not merely wasteful: the statuses above pop a
 * justification prompt, so a no-op write would nag on every sync. It also means
 * moving between Submitted/Won/Lost in the app never touches bFO, because all
 * three already map to 'Completed' — no special case needed for that rule.
 */
export const shouldWriteSrStatus = (currentInBfo: string, appStatus: OpportunityStatus): boolean => {
    const target = SR_STATUS_BY_APP_STATUS[appStatus];
    if (!target) return false;
    return currentInBfo.trim() !== target;
};

/** True when moving to this status will make bFO ask for a justification. */
export const srStatusNeedsJustification = (appStatus: OpportunityStatus): boolean =>
    SR_STATUS_NEEDS_JUSTIFICATION.has(SR_STATUS_BY_APP_STATUS[appStatus]);

/**
 * Opportunity `Forecast Category` -> app status. This one flows bFO -> app and
 * never the other way: the field has no inline-edit control because Salesforce
 * derives it from the sales stage. Only the two closed outcomes are mapped;
 * every other value (Pipeline, Best Case, Commit, ...) means "still open", so
 * the app keeps whatever status it already had.
 */
export const APP_STATUS_BY_FORECAST_CATEGORY: Readonly<Record<string, OpportunityStatus>> = {
    'Won': 'Won',
    'Omitted': 'Lost',
};

/** The app status implied by a Forecast Category, or null while still open. */
export const appStatusFromForecastCategory = (forecastCategory: string): OpportunityStatus | null =>
    APP_STATUS_BY_FORECAST_CATEGORY[forecastCategory.trim()] ?? null;

// --- What a recipe can capture -------------------------------------------

/**
 * The app fields the recorder offers when the user points at something in bFO.
 * Split by cadence: the one-time group needs the slow walk out to the Account
 * page, the recurring group is what the sync button refreshes.
 */
export const RECIPE_FIELDS = [
    { key: 'clientAddress', label: 'Direccion del cliente', cadence: 'once' },
    { key: 'opportunityUrl', label: 'URL de la Op', cadence: 'once' },
    { key: 'oppLinesLink', label: 'Link de Opportunity Lines', cadence: 'once' },
    { key: 'finalAmount', label: 'Monto final (Amount)', cadence: 'sync' },
    { key: 'forecastCategory', label: 'Won / Lost (Forecast Category)', cadence: 'sync' },
    { key: 'srComments', label: 'Comentarios del SR', cadence: 'sync' },
    { key: 'srStatus', label: 'Status del SR', cadence: 'sync' },
    { key: 'expectedCompletionDate', label: 'Expected Completion Date', cadence: 'sync' },
    { key: 'resolutionComments', label: 'Resolution Comments', cadence: 'sync' },
] as const;

export type RecipeFieldKey = typeof RECIPE_FIELDS[number]['key'];
