/**
 * Tiny Excel-style expression language for the Proposal Age target.
 *
 * The user edits the target formula in Settings (or in the exported Excel) as text, e.g.
 * `ROUND(MAX(BASE, DIAS * MULT))`. It is parsed and evaluated here — never with eval() —
 * against the variables the alarm engine computes for one proposal.
 *
 * Syntax: numbers, variables, + - * / ^, parentheses, comparisons (< <= > >= = <>) that yield
 * 1/0, and functions with `,` or `;` separators (English or Spanish Excel names). A leading `=`
 * is accepted so a formula can be pasted straight from Excel.
 */

export type AlarmFormulaVariables = Record<string, number>;

export const DEFAULT_ALARM_TARGET_FORMULA = 'ROUND(MAX(BASE, DIAS * MULT))';

/** Shown in Settings and in the exported Excel so the formula can be written without guessing. */
export const ALARM_FORMULA_VARIABLES: Array<{ name: string; description: string }> = [
    { name: 'DIAS', description: 'Suma de todos los días seleccionados (tipo + scope + monto + cotización + execution center)' },
    { name: 'DIAS_TIPO', description: 'Días de los tipos de propuesta seleccionados (Green field, Upgrade...)' },
    { name: 'DIAS_SCOPE', description: 'Días de sistemas, aplicaciones, cabinets, resales y extras' },
    { name: 'DIAS_MONTO', description: 'Días del tramo de monto alcanzado' },
    { name: 'DIAS_COTIZACION', description: 'Días de Budgetary / Firm' },
    { name: 'DIAS_CENTRO', description: 'Ajuste de días del Execution Center (opcional; 0 si no se eligió)' },
    { name: 'BASE', description: 'Base / días mínimos' },
    { name: 'MULT', description: 'Suma de multiplicadores activos, o 1 si no hay ninguno (como el Excel original)' },
    { name: 'MULT_SUMA', description: 'Suma de multiplicadores activos (0 si no hay)' },
    { name: 'MULT_PRODUCTO', description: 'Producto de multiplicadores activos (1 si no hay)' },
    { name: 'N_MULT', description: 'Cuántos multiplicadores están activos' },
    { name: 'REV', description: 'Multiplicador de la revisión (0.30 ligera / 0.85 mayor), 0 en R0' },
    { name: 'ES_REVISION', description: '1 si la propuesta es R1 o posterior, 0 si es R0' },
    { name: 'NUM_REVISION', description: 'Número de revisión (R2 = 2)' },
    { name: 'ES_FIRM', description: '1 si es Firm, 0 si es Budgetary' },
    { name: 'MONTO', description: 'Monto de la propuesta en USD' },
    { name: '<MULTIPLICADOR>', description: 'Cada multiplicador de Scope por nombre, p. ej. SIMILAR_COPY o SPLIT: su factor si está seleccionado, 0 si no' },
];

export const ALARM_FORMULA_FUNCTIONS = 'ROUND/REDONDEAR, ROUNDUP/REDONDEAR.MAS, ROUNDDOWN/REDONDEAR.MENOS, MAX, MIN, IF/SI, AND/Y, OR/O, NOT/NO, ABS, SUM/SUMA';

/** Variable name for a free label, e.g. "Similar/Copy" -> SIMILAR_COPY. */
export const alarmFormulaVariableName = (label: string): string => String(label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

type Token = { type: 'num'; value: number } | { type: 'id'; value: string } | { type: 'op'; value: string };

const tokenize = (source: string): Token[] => {
    const tokens: Token[] = [];
    let i = 0;
    while (i < source.length) {
        const ch = source[i];
        if (/\s/.test(ch)) { i += 1; continue; }
        if (/[0-9.]/.test(ch)) {
            const match = source.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
            if (!match) throw new Error(`Número inválido cerca de "${source.slice(i, i + 8)}"`);
            tokens.push({ type: 'num', value: Number(match[0]) });
            i += match[0].length;
            continue;
        }
        if (/[A-Za-z_À-ſ]/.test(ch)) {
            const match = source.slice(i).match(/^[A-Za-z_À-ſ][A-Za-z0-9_.À-ſ]*/)!;
            tokens.push({ type: 'id', value: match[0].toUpperCase() });
            i += match[0].length;
            continue;
        }
        const two = source.slice(i, i + 2);
        if (['<=', '>=', '<>'].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
        if ('+-*/^(),;<>='.includes(ch)) { tokens.push({ type: 'op', value: ch === ';' ? ',' : ch }); i += 1; continue; }
        throw new Error(`Carácter no permitido: "${ch}"`);
    }
    return tokens;
};

/** Excel ROUND: half away from zero, with optional digits. */
const excelRound = (value: number, digits = 0, mode: 'round' | 'up' | 'down' = 'round') => {
    const factor = 10 ** Math.trunc(digits);
    const scaled = Math.abs(value) * factor;
    const rounded = mode === 'up' ? Math.ceil(scaled - 1e-9) : mode === 'down' ? Math.floor(scaled + 1e-9) : Math.floor(scaled + 0.5 + 1e-9);
    return Math.sign(value) * rounded / factor;
};

const FUNCTIONS: Record<string, (args: number[]) => number> = {
    ROUND: args => excelRound(args[0], args[1] ?? 0),
    ROUNDUP: args => excelRound(args[0], args[1] ?? 0, 'up'),
    ROUNDDOWN: args => excelRound(args[0], args[1] ?? 0, 'down'),
    MAX: args => Math.max(...args),
    MIN: args => Math.min(...args),
    ABS: args => Math.abs(args[0]),
    SUM: args => args.reduce((total, value) => total + value, 0),
    AND: args => (args.every(Boolean) ? 1 : 0),
    OR: args => (args.some(Boolean) ? 1 : 0),
    NOT: args => (args[0] ? 0 : 1),
};
const FUNCTION_ALIASES: Record<string, string> = {
    REDONDEAR: 'ROUND', 'REDONDEAR.MAS': 'ROUNDUP', 'REDONDEAR.MENOS': 'ROUNDDOWN', SUMA: 'SUM', Y: 'AND', O: 'OR', NO: 'NOT', SI: 'IF',
};

/** Evaluates `formula` with `variables`. Throws an Error with a readable (Spanish) message. */
export const evaluateAlarmFormula = (formula: string, variables: AlarmFormulaVariables): number => {
    const tokens = tokenize(String(formula || '').trim().replace(/^=/, ''));
    if (!tokens.length) throw new Error('La fórmula está vacía');
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (value: string) => peek()?.type === 'op' && peek()!.value === value;
    const expect = (value: string) => {
        if (!isOp(value)) throw new Error(`Se esperaba "${value}"`);
        pos += 1;
    };

    const parseComparison = (): number => {
        let left = parseAdditive();
        while (peek()?.type === 'op' && ['<', '>', '<=', '>=', '=', '<>'].includes(String(peek()!.value))) {
            const op = tokens[pos++].value;
            const right = parseAdditive();
            left = Number(op === '<' ? left < right : op === '>' ? left > right : op === '<=' ? left <= right : op === '>=' ? left >= right : op === '=' ? Math.abs(left - right) < 1e-9 : Math.abs(left - right) >= 1e-9);
        }
        return left;
    };
    const parseAdditive = (): number => {
        let left = parseTerm();
        while (isOp('+') || isOp('-')) {
            const op = tokens[pos++].value;
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    };
    const parseTerm = (): number => {
        let left = parseUnary();
        while (isOp('*') || isOp('/')) {
            const op = tokens[pos++].value;
            const right = parseUnary();
            // x/0 gives Infinity/NaN instead of throwing, so an IF branch that is not taken
            // (e.g. IF(MULT_SUMA=0, DIAS, DIAS/MULT_SUMA)) does not break the formula.
            left = op === '*' ? left * right : left / right;
        }
        return left;
    };
    const parseUnary = (): number => {
        if (isOp('-')) { pos += 1; return -parseUnary(); }
        if (isOp('+')) { pos += 1; return parseUnary(); }
        return parsePower();
    };
    const parsePower = (): number => {
        const base = parsePrimary();
        if (isOp('^')) { pos += 1; return base ** parseUnary(); }
        return base;
    };
    const parseArgs = (): number[] => {
        expect('(');
        const values: number[] = [];
        if (!isOp(')')) {
            values.push(parseComparison());
            while (isOp(',')) { pos += 1; values.push(parseComparison()); }
        }
        expect(')');
        return values;
    };
    const parsePrimary = (): number => {
        const token = peek();
        if (!token) throw new Error('La fórmula termina antes de tiempo');
        if (token.type === 'num') { pos += 1; return token.value; }
        if (token.type === 'op' && token.value === '(') {
            pos += 1;
            const value = parseComparison();
            expect(')');
            return value;
        }
        if (token.type === 'id') {
            pos += 1;
            if (isOp('(')) {
                const name = FUNCTION_ALIASES[token.value] || token.value;
                const args = parseArgs();
                if (name === 'IF') {
                    if (args.length < 2 || args.length > 3) throw new Error('IF/SI necesita 2 o 3 argumentos');
                    return args[0] ? args[1] : (args[2] ?? 0);
                }
                const fn = FUNCTIONS[name];
                if (!fn) throw new Error(`Función desconocida: ${token.value}`);
                if (!args.length) throw new Error(`${token.value} necesita al menos un argumento`);
                return fn(args);
            }
            if (!(token.value in variables)) throw new Error(`Variable desconocida: ${token.value}`);
            return variables[token.value];
        }
        throw new Error(`"${token.value}" inesperado`);
    };

    const result = parseComparison();
    if (pos < tokens.length) {
        const extra = tokens[pos];
        throw new Error(`Sobra "${extra.value}" en la fórmula`);
    }
    if (!Number.isFinite(result)) throw new Error('La fórmula no da un número válido');
    return result;
};

/** Returns null when the formula is valid for these variable names, else the error message. */
export const validateAlarmFormula = (formula: string, variableNames: string[]): string | null => {
    const sample = Object.fromEntries(variableNames.map(name => [name, 1]));
    try { evaluateAlarmFormula(formula, sample); return null; }
    catch (error: any) { return error?.message || 'Fórmula inválida'; }
};
