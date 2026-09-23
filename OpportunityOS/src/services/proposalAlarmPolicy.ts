import type { AlarmConfig, Opportunity, ProposalAlarmPolicy } from '../types';
import { readScopeGlance } from './scopeSummary';
import type { ScopeCatalog } from '../components/scopeCatalog';

export const DEFAULT_PROPOSAL_ALARM_POLICY: ProposalAlarmPolicy = {
    defaultDays: 20,
    scopeDays: {
        'Green field': 30,
        Upgrade: 20,
        Migration: 25,
        CF: 18,
        Parts: 12,
        Services: 15,
        Training: 10,
    },
    amountTiers: [
        { minAmount: 100000, extraDays: 3, complexityMultiplier: 1.1 },
        { minAmount: 500000, extraDays: 5, complexityMultiplier: 1.25 },
        { minAmount: 1000000, extraDays: 8, complexityMultiplier: 1.5 },
    ],
    warningPercent: 70,
    warningOffsetDays: 0,
    criticalPercent: 100,
    criticalOffsetDays: 0,
    quoteTypeDays: { Budgetary: 0, Firm: 5 },
    revisionPercent: { light: 50, major: 85 },
    scopeItemDays: {
        'New Cabinets': 5,
        'Regional Integration': 4,
        'India Cabinets': 6,
        'Resales <20%': 1,
        'Resales <49%': 2,
        'Resales >50%': 4,
    },
    tenderEstimateWeightPercent: 60,
};

export const getProposalAlarmPolicy = (alarms: AlarmConfig[] = []): ProposalAlarmPolicy => {
    const stored = alarms.find(alarm => alarm.id === 'proposal-scope-policy')?.proposalPolicy;
    return {
        ...DEFAULT_PROPOSAL_ALARM_POLICY,
        ...stored,
        scopeDays: { ...DEFAULT_PROPOSAL_ALARM_POLICY.scopeDays, ...(stored?.scopeDays || {}) },
        amountTiers: stored?.amountTiers?.length ? stored.amountTiers : DEFAULT_PROPOSAL_ALARM_POLICY.amountTiers,
        quoteTypeDays: { ...DEFAULT_PROPOSAL_ALARM_POLICY.quoteTypeDays, ...(stored?.quoteTypeDays || {}) },
        revisionPercent: { ...DEFAULT_PROPOSAL_ALARM_POLICY.revisionPercent, ...(stored?.revisionPercent || {}) },
        scopeItemDays: { ...DEFAULT_PROPOSAL_ALARM_POLICY.scopeItemDays, ...(stored?.scopeItemDays || {}) },
        tenderEstimateWeightPercent: stored?.tenderEstimateWeightPercent ?? DEFAULT_PROPOSAL_ALARM_POLICY.tenderEstimateWeightPercent,
    };
};

/** Gives every catalog entry an explicit editable alarm value before Settings is persisted. */
export const syncProposalPolicyWithScopeCatalog = (policy: ProposalAlarmPolicy, catalog: ScopeCatalog): ProposalAlarmPolicy => {
    const scopeDays = { ...policy.scopeDays };
    catalog.scope.forEach(option => { if (scopeDays[option.label] === undefined) scopeDays[option.label] = policy.defaultDays; });
    const scopeItemDays = { ...policy.scopeItemDays };
    (Object.entries(catalog) as [keyof ScopeCatalog, ScopeCatalog[keyof ScopeCatalog]][]).forEach(([group, options]) => options.forEach(option => {
        if (group !== 'scope' && scopeItemDays[option.label] === undefined) scopeItemDays[option.label] = 0;
        (option.children || []).forEach(child => { if (scopeItemDays[child.label] === undefined) scopeItemDays[child.label] = 0; });
    }));
    return { ...policy, scopeDays, scopeItemDays };
};

export interface ProposalAlarmCalculationInput {
    scopeTypes?: string[];
    systems?: string[];
    applications?: string[];
    quickNotes?: string[];
    extras?: string[];
    quoteType?: 'Firm' | 'Budgetary';
    amount?: number;
    revision?: string;
    revisionChangeImpact?: 'light' | 'major';
    /**
     * Tender owner's own duration estimate. It weighs on the target but does not replace it:
     * see tenderEstimateWeightPercent in the policy.
     */
    tenderEstimateDays?: number | null;
}

/** Single source of truth for the calculator, cards and KPI age alerts. */
export const calculateProposalAlarm = (input: ProposalAlarmCalculationInput, policy: ProposalAlarmPolicy) => {
    const scopeTypes = input.scopeTypes || [];
    const systems = input.systems || [];
    const applications = input.applications || [];
    const quickNotes = input.quickNotes || [];
    const extras = input.extras || [];
    const scopeBase = scopeTypes.reduce((largest, type) => Math.max(largest, policy.scopeDays[type] ?? policy.defaultDays), policy.defaultDays);
    const amount = Math.max(0, Number(input.amount) || 0);
    const matchingTier = policy.amountTiers.filter(tier => amount >= Math.max(0, tier.minAmount || 0)).sort((a, b) => b.minAmount - a.minAmount)[0];
    const amountDays = Math.max(0, matchingTier?.extraDays || 0);
    const complexityMultiplier = Math.max(0, Number(matchingTier?.complexityMultiplier) || 1);
    const selectedItems = [...systems, ...applications, ...quickNotes, ...extras];
    const specificScopeDays = selectedItems.reduce((total, label) => total + Math.max(0, Number(policy.scopeItemDays[label]) || 0), 0);
    const quoteTypeDays = policy.quoteTypeDays[input.quoteType || 'Budgetary'] || 0;
    const normalDays = Math.max(1, Math.round(scopeBase + amountDays + specificScopeDays * complexityMultiplier + quoteTypeDays));
    const revisionNumber = Number((input.revision || 'R0').match(/\d+/)?.[0] || 0);
    const revisionDifficulty = input.revisionChangeImpact === 'major' ? 'major' : 'light';
    const revisionPercent = Math.min(100, Math.max(1, Number(policy.revisionPercent[revisionDifficulty]) || DEFAULT_PROPOSAL_ALARM_POLICY.revisionPercent[revisionDifficulty]));
    const revisionFactor = revisionNumber > 0 ? revisionPercent / 100 : 1;
    const calculatedDays = Math.max(1, Math.round(normalDays * revisionFactor));
    // The tender owner knows things the Scope cannot express (a difficult customer, a vendor that
    // always answers late), so their estimate has to move the target. But it is one opinion against
    // a model fed by scope, amount, quote type and revision, and taking it as absolute truth is what
    // made the target ignore everything else. Blend the two instead, with a configurable weight.
    const rawTenderEstimateDays = Math.max(0, Math.round(Number(input.tenderEstimateDays) || 0));
    const isTenderEstimateApplied = rawTenderEstimateDays > 0;
    const tenderEstimateWeightPercent = Math.min(100, Math.max(0, Math.round(
        Number(policy.tenderEstimateWeightPercent ?? DEFAULT_PROPOSAL_ALARM_POLICY.tenderEstimateWeightPercent) || 0
    )));
    const tenderEstimateWeight = tenderEstimateWeightPercent / 100;
    const blendedDays = Math.max(1, Math.round(
        calculatedDays * (1 - tenderEstimateWeight) + rawTenderEstimateDays * tenderEstimateWeight
    ));
    const expectedDays = isTenderEstimateApplied ? blendedDays : calculatedDays;
    const warningPercent = Math.min(99, Math.max(1, Number(policy.warningPercent) || 70));
    const criticalPercent = Math.max(warningPercent + 1, Math.min(200, Number(policy.criticalPercent) || 100));
    const warningOffsetDays = Math.round(Number(policy.warningOffsetDays) || 0);
    const criticalOffsetDays = Math.round(Number(policy.criticalOffsetDays) || 0);
    return {
        expectedDays,
        calculatedDays,
        normalDays,
        revisionFactor,
        scopeBase,
        amountDays,
        specificScopeDays,
        complexityMultiplier,
        quoteTypeDays,
        /** What the tender owner typed, untouched — the UI shows it next to the blended target. */
        tenderEstimateDays: isTenderEstimateApplied ? rawTenderEstimateDays : null,
        isTenderEstimateApplied,
        tenderEstimateWeightPercent,
        warningDays: Math.max(1, Math.round(expectedDays * warningPercent / 100) + warningOffsetDays),
        criticalDays: Math.max(1, Math.round(expectedDays * criticalPercent / 100) + criticalOffsetDays),
        warningPercent,
        criticalPercent,
        warningOffsetDays,
        criticalOffsetDays,
    };
};

/** Calculates the expected proposal age from the live Scope and Commercial amount. */
export const getExpectedProposalDays = (opportunity: Opportunity, alarms: AlarmConfig[] = [], catalog?: ScopeCatalog): number => {
    const policy = getProposalAlarmPolicy(alarms);
    const scope = readScopeGlance(opportunity.notes, catalog, opportunity.labels || []);
    const amount = Math.max(
        Number(opportunity.commercial?.cqaOfficialSellPrice || 0),
        Number(opportunity.kpis?.proposalAmountUSD || 0),
        ...((opportunity.commercial?.customSections || []).map(section => Number(section.sellPrice || 0))),
    );
    return calculateProposalAlarm({ scopeTypes: scope.scope, systems: scope.systems, applications: scope.applications, quickNotes: scope.quickNotes, extras: scope.extras, quoteType: opportunity.quoteType, amount, revision: opportunity.revision, revisionChangeImpact: opportunity.kpis?.revisionChangeImpact, tenderEstimateDays: opportunity.kpis?.proposalDaysEstimate }, policy).expectedDays;
};

export const getProposalAgeTargets = (opportunity: Opportunity, alarms: AlarmConfig[] = [], catalog?: ScopeCatalog) => {
    const policy = getProposalAlarmPolicy(alarms);
    const scope = readScopeGlance(opportunity.notes, catalog, opportunity.labels || []);
    const amount = Math.max(
        Number(opportunity.commercial?.cqaOfficialSellPrice || 0),
        Number(opportunity.kpis?.proposalAmountUSD || 0),
        ...((opportunity.commercial?.customSections || []).map(section => Number(section.sellPrice || 0))),
    );
    const calculation = calculateProposalAlarm({ scopeTypes: scope.scope, systems: scope.systems, applications: scope.applications, quickNotes: scope.quickNotes, extras: scope.extras, quoteType: opportunity.quoteType, amount, revision: opportunity.revision, revisionChangeImpact: opportunity.kpis?.revisionChangeImpact, tenderEstimateDays: opportunity.kpis?.proposalDaysEstimate }, policy);
    return {
        expectedDays: calculation.expectedDays,
        calculatedDays: calculation.calculatedDays,
        warningDays: calculation.warningDays,
        criticalDays: calculation.criticalDays,
        warningPercent: calculation.warningPercent,
        criticalPercent: calculation.criticalPercent,
        warningOffsetDays: calculation.warningOffsetDays,
        criticalOffsetDays: calculation.criticalOffsetDays,
        quoteTypeDays: Math.round(Number(policy.quoteTypeDays[opportunity.quoteType || 'Budgetary']) || 0),
        revisionFactor: calculation.revisionFactor,
        revisionPercent: policy.revisionPercent,
        isManualEstimate: calculation.isTenderEstimateApplied,
        tenderEstimateDays: calculation.tenderEstimateDays,
        tenderEstimateWeightPercent: calculation.tenderEstimateWeightPercent,
    };
};
