import type { AlarmConfig, Opportunity, ProposalAlarmPolicy } from '../types';
import { readScopeGlance } from './scopeSummary';
import { EXECUTION_CENTERS, type ScopeCatalog } from '../components/scopeCatalog';
import { ALARM_FORMULA_VARIABLES, alarmFormulaVariableName, DEFAULT_ALARM_TARGET_FORMULA, evaluateAlarmFormula, type AlarmFormulaVariables } from './alarmFormula';

/**
 * Bumped when the formula changes shape. A stored policy from an older formula keeps only its
 * alert thresholds and custom labels; every day/multiplier value restarts from the new defaults.
 */
export const PROPOSAL_ALARM_FORMULA_VERSION = 2;

/**
 * Mirrors Alarmas.xlsx: every selected row adds its days, the active multipliers are summed
 * (1 when none applies), and the result never drops below the Base.
 */
export const DEFAULT_PROPOSAL_ALARM_POLICY: ProposalAlarmPolicy = {
    formulaVersion: PROPOSAL_ALARM_FORMULA_VERSION,
    defaultDays: 5,
    scopeDays: {
        'Green field': 6,
        Upgrade: 5,
        Migration: 6,
        CF: 4,
        Parts: 2,
        Services: 3,
        Training: 2,
    },
    amountTiers: [
        { minAmount: 250000, extraDays: 2 },
        { minAmount: 500000, extraDays: 3 },
        { minAmount: 1000000, extraDays: 6 },
        { minAmount: 2000000, extraDays: 9 },
        { minAmount: 3000000, extraDays: 11 },
    ],
    warningPercent: 70,
    warningOffsetDays: 0,
    criticalPercent: 100,
    criticalOffsetDays: 0,
    quoteTypeDays: { Budgetary: 1, Firm: 2 },
    revisionPercent: { light: 30, major: 85 },
    scopeItemDays: {
        EAE: 2,
        'Modicon 580': 2,
        EPE: 2,
        EPP: 2,
        Foxboro: 2,
        Safety: 2,
        AVEVA: 2,
        Cyber: 2,
        CPs: 0,
        'I/Os': 0,
        'Servers / Workstations': 0,
        Network: 0,
        'Tricon CX': 0,
        Tricon: 0,
        Trident: 0,
        TriGP: 0,
        'M580 S': 0,
        'SIS/ESD': 1,
        BMS: 1,
        TMC: 1,
        'SF&G': 1,
        HIPPS: 1,
        'New Cabinets': 1,
        'Resales <20%': 2,
        'Resales <49%': 5,
        'Resales >50%': 7,
        'Regional Integration': 3,
        'India Cabinets': 6,
        'Similar/Copy': 0,
        Split: 0,
    },
    scopeMultiplierPercent: {
        'Similar/Copy': 60,
        Split: 90,
    },
    executionCenterDays: Object.fromEntries(EXECUTION_CENTERS.map(center => [center, 0])),
    targetFormula: DEFAULT_ALARM_TARGET_FORMULA,
};

/** Execution Center days, falling back to the short-lived free-form countryDays when that is all there is. */
const legacyCenterDays = (stored: ProposalAlarmPolicy): Record<string, number> =>
    stored.executionCenterDays || Object.fromEntries(Object.entries(stored.countryDays || {}).filter(([name]) => (EXECUTION_CENTERS as readonly string[]).includes(name)));

export const getProposalAlarmPolicy = (alarms: AlarmConfig[] = []): ProposalAlarmPolicy => {
    const stored = alarms.find(alarm => alarm.id === 'proposal-scope-policy')?.proposalPolicy;
    const defaults = DEFAULT_PROPOSAL_ALARM_POLICY;
    if (stored && stored.formulaVersion !== PROPOSAL_ALARM_FORMULA_VERSION) {
        // Old formula: keep the alert thresholds and any custom Scope labels, restart the rest.
        return {
            ...defaults,
            warningPercent: stored.warningPercent ?? defaults.warningPercent,
            warningOffsetDays: stored.warningOffsetDays ?? defaults.warningOffsetDays,
            criticalPercent: stored.criticalPercent ?? defaults.criticalPercent,
            criticalOffsetDays: stored.criticalOffsetDays ?? defaults.criticalOffsetDays,
            scopeDays: { ...(stored.scopeDays || {}), ...defaults.scopeDays },
            scopeItemDays: { ...(stored.scopeItemDays || {}), ...defaults.scopeItemDays },
            scopeMultiplierPercent: { ...defaults.scopeMultiplierPercent },
            executionCenterDays: { ...defaults.executionCenterDays, ...legacyCenterDays(stored) },
        };
    }
    return {
        ...defaults,
        ...stored,
        scopeDays: { ...defaults.scopeDays, ...(stored?.scopeDays || {}) },
        amountTiers: stored?.amountTiers?.length ? stored.amountTiers : defaults.amountTiers,
        quoteTypeDays: { ...defaults.quoteTypeDays, ...(stored?.quoteTypeDays || {}) },
        revisionPercent: { ...defaults.revisionPercent, ...(stored?.revisionPercent || {}) },
        scopeItemDays: { ...defaults.scopeItemDays, ...(stored?.scopeItemDays || {}) },
        scopeMultiplierPercent: { ...(defaults.scopeMultiplierPercent || {}), ...(stored?.scopeMultiplierPercent || {}) },
        executionCenterDays: { ...defaults.executionCenterDays, ...(stored ? legacyCenterDays(stored) : {}) },
        countryDays: undefined,
    };
};

/** Gives every catalog entry an explicit editable alarm value before Settings is persisted. */
export const syncProposalPolicyWithScopeCatalog = (policy: ProposalAlarmPolicy, catalog: ScopeCatalog): ProposalAlarmPolicy => {
    const scopeDays = { ...policy.scopeDays };
    catalog.scope.forEach(option => { if (scopeDays[option.label] === undefined) scopeDays[option.label] = 0; });
    const scopeItemDays = { ...policy.scopeItemDays };
    (Object.entries(catalog) as [keyof ScopeCatalog, ScopeCatalog[keyof ScopeCatalog]][]).forEach(([group, options]) => options.forEach(option => {
        if (group !== 'scope' && scopeItemDays[option.label] === undefined) scopeItemDays[option.label] = 0;
        (option.children || []).forEach(child => { if (scopeItemDays[child.label] === undefined) scopeItemDays[child.label] = 0; });
    }));
    return { ...policy, formulaVersion: PROPOSAL_ALARM_FORMULA_VERSION, scopeDays, scopeItemDays };
};

/** Every name a target formula may use: the fixed variables plus one per Scope multiplier label. */
export const buildAlarmFormulaVariables = (
    policy: ProposalAlarmPolicy,
    fixed: AlarmFormulaVariables,
    activeMultipliers: Array<{ label: string; factor: number }> = [],
): AlarmFormulaVariables => {
    const variables: AlarmFormulaVariables = {};
    Object.keys(policy.scopeMultiplierPercent || {}).forEach(label => {
        const name = alarmFormulaVariableName(label);
        if (name) variables[name] = activeMultipliers.find(item => item.label === label)?.factor ?? 0;
    });
    return { ...variables, ...fixed };
};

/** Names accepted by the target formula for this policy — used to validate it in Settings/import. */
export const getAlarmFormulaVariableNames = (policy: ProposalAlarmPolicy): string[] => Object.keys(buildAlarmFormulaVariables(policy, Object.fromEntries(
    ALARM_FORMULA_VARIABLES.filter(item => !item.name.startsWith('<')).map(item => [item.name, 0]),
)));

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
    /** Optional Scope field; empty adds nothing. */
    executionCenter?: string;
}

/**
 * Single source of truth for the calculator, cards and KPI age alerts. Same formula as
 * Alarmas.xlsx: ROUND(MAX(Base, SUM(selected days) x SUM(active multipliers, or 1 if none))).
 */
export const calculateProposalAlarm = (input: ProposalAlarmCalculationInput, policy: ProposalAlarmPolicy) => {
    const days = (value: unknown) => Number(value) || 0;
    const scopeTypes = input.scopeTypes || [];
    const selectedItems = [...(input.systems || []), ...(input.applications || []), ...(input.quickNotes || []), ...(input.extras || [])];
    const scopeTypeDays = scopeTypes.reduce((total, type) => total + days(policy.scopeDays[type]), 0);
    const amount = Math.max(0, Number(input.amount) || 0);
    const matchingTier = policy.amountTiers.filter(tier => amount >= Math.max(0, tier.minAmount || 0)).sort((a, b) => b.minAmount - a.minAmount)[0];
    const amountDays = days(matchingTier?.extraDays);
    const specificScopeDays = selectedItems.reduce((total, label) => total + days(policy.scopeItemDays[label]), 0);
    const quoteTypeDays = days(policy.quoteTypeDays[input.quoteType || 'Budgetary']);
    const executionCenterDays = input.executionCenter ? days(policy.executionCenterDays?.[input.executionCenter]) : 0;
    const sumDays = scopeTypeDays + specificScopeDays + amountDays + quoteTypeDays + executionCenterDays;

    const revisionNumber = Number((input.revision || 'R0').match(/\d+/)?.[0] || 0);
    const revisionDifficulty = input.revisionChangeImpact === 'major' ? 'major' : 'light';
    const revisionPercent = Math.min(100, Math.max(1, Number(policy.revisionPercent[revisionDifficulty]) || DEFAULT_PROPOSAL_ALARM_POLICY.revisionPercent[revisionDifficulty]));
    const multipliers: Array<{ label: string; factor: number }> = [];
    if (revisionNumber > 0) multipliers.push({ label: `${revisionDifficulty} revision`, factor: revisionPercent / 100 });
    Object.entries(policy.scopeMultiplierPercent || {}).forEach(([label, percent]) => {
        if (selectedItems.includes(label)) multipliers.push({ label, factor: Math.max(0, days(percent)) / 100 });
    });
    const multiplierSum = multipliers.reduce((total, item) => total + item.factor, 0);
    const multiplier = multiplierSum === 0 ? 1 : multiplierSum;
    const minimumDays = Math.max(1, days(policy.defaultDays) || DEFAULT_PROPOSAL_ALARM_POLICY.defaultDays);
    const defaultTarget = Math.round(Math.max(minimumDays, sumDays * multiplier));
    const formula = (policy.targetFormula || '').trim() || DEFAULT_ALARM_TARGET_FORMULA;
    const variables = buildAlarmFormulaVariables(policy, {
        DIAS: sumDays,
        DIAS_TIPO: scopeTypeDays,
        DIAS_SCOPE: specificScopeDays,
        DIAS_MONTO: amountDays,
        DIAS_COTIZACION: quoteTypeDays,
        DIAS_CENTRO: executionCenterDays,
        BASE: minimumDays,
        MULT: multiplier,
        MULT_SUMA: multiplierSum,
        MULT_PRODUCTO: multipliers.reduce((total, item) => total * item.factor, 1),
        N_MULT: multipliers.length,
        REV: revisionNumber > 0 ? revisionPercent / 100 : 0,
        ES_REVISION: revisionNumber > 0 ? 1 : 0,
        NUM_REVISION: revisionNumber,
        ES_FIRM: input.quoteType === 'Firm' ? 1 : 0,
        MONTO: amount,
    }, multipliers);
    let formulaError: string | null = null;
    let expectedDays = defaultTarget;
    try {
        // A custom formula never produces less than one day; a broken one falls back to the default.
        expectedDays = Math.max(1, Math.round(evaluateAlarmFormula(formula, variables)));
    } catch (error: any) {
        formulaError = error?.message || 'Fórmula inválida';
    }

    const warningPercent = Math.min(99, Math.max(1, Number(policy.warningPercent) || 70));
    const criticalPercent = Math.max(warningPercent + 1, Math.min(200, Number(policy.criticalPercent) || 100));
    const warningOffsetDays = Math.round(Number(policy.warningOffsetDays) || 0);
    const criticalOffsetDays = Math.round(Number(policy.criticalOffsetDays) || 0);
    return {
        expectedDays,
        calculatedDays: expectedDays,
        /** Days before multipliers and the Base floor. */
        sumDays,
        scopeTypeDays,
        amountDays,
        specificScopeDays,
        quoteTypeDays,
        executionCenterDays,
        /** Revision share only (1 on R0); `multiplier` is what the target actually used. */
        revisionFactor: revisionNumber > 0 ? revisionPercent / 100 : 1,
        multipliers,
        multiplier,
        minimumDays,
        isMinimumApplied: sumDays * multiplier < minimumDays && expectedDays === minimumDays,
        formula,
        formulaError,
        variables,
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
    return calculateProposalAlarm({ scopeTypes: scope.scope, systems: scope.systems, applications: scope.applications, quickNotes: scope.quickNotes, extras: scope.extras, quoteType: opportunity.quoteType, amount, revision: opportunity.revision, revisionChangeImpact: opportunity.kpis?.revisionChangeImpact, executionCenter: scope.executionCenters[0] }, policy).expectedDays;
};

export const getProposalAgeTargets = (opportunity: Opportunity, alarms: AlarmConfig[] = [], catalog?: ScopeCatalog) => {
    const policy = getProposalAlarmPolicy(alarms);
    const scope = readScopeGlance(opportunity.notes, catalog, opportunity.labels || []);
    const amount = Math.max(
        Number(opportunity.commercial?.cqaOfficialSellPrice || 0),
        Number(opportunity.kpis?.proposalAmountUSD || 0),
        ...((opportunity.commercial?.customSections || []).map(section => Number(section.sellPrice || 0))),
    );
    const calculation = calculateProposalAlarm({ scopeTypes: scope.scope, systems: scope.systems, applications: scope.applications, quickNotes: scope.quickNotes, extras: scope.extras, quoteType: opportunity.quoteType, amount, revision: opportunity.revision, revisionChangeImpact: opportunity.kpis?.revisionChangeImpact, executionCenter: scope.executionCenters[0] }, policy);
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
        multiplier: calculation.multiplier,
        multipliers: calculation.multipliers,
        sumDays: calculation.sumDays,
        formulaError: calculation.formulaError,
        isMinimumApplied: calculation.isMinimumApplied,
        minimumDays: calculation.minimumDays,
        revisionPercent: policy.revisionPercent,
    };
};
