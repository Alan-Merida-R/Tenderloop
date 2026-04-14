import { DependencyRule, ItemResponse, StandardItem, LogicOperator, ResponseStatus } from '../types';

/**
 * Engine de Evaluación de Dependencias (Tender Executive Flow)
 * Evalúa si un item debe mostrarse u ocultarse basándose en las respuestas actuales.
 */

export const checkDependency = (
  rule: DependencyRule, 
  responses: Record<string, ItemResponse> = {}
): boolean => {
  if (!responses) return false;
  const sourceResponse = responses[rule.targetId];
  if (!sourceResponse) return false;

  const { value } = sourceResponse;

  switch (rule.operator) {
    case 'equals':
      if (Array.isArray(rule.value)) {
        return rule.value.includes(value);
      }
      return value === rule.value;
    case 'not_equals':
      return value !== rule.value;
    case 'contains':
      return Array.isArray(value) && value.includes(rule.value);
    case 'greater_than':
      return Number(value) > Number(rule.value);
    case 'less_than':
      return Number(value) < Number(rule.value);
    case 'exists':
      const val = String(sourceResponse.value || '').trim();
      return val !== '';
    case 'any_value':
      return sourceResponse.status === 'answered' || sourceResponse.status === 'confirmed';
    default:
      return false;
  }
}

/**
 * Normaliza IDs y valores para comparación consistente.
 */
const normalize = (val: any): string => String(val || '').trim().toLowerCase().replace(/[\u2013\u2014]/g, '-');

/**
 * Detects whether a logicString is in "numbered format" ((1 AND 2) OR 3)
 * vs "old ID:VALUE format" (Q1:YES AND Q2:No).
 * Numbered format never contains a colon and always contains at least one digit.
 * Old format always contains a colon to separate targetId from expected value.
 */
const isNumberedLogicFormat = (s: string): boolean => !s.includes(':') && /\d/.test(s);

/**
 * Evalúa lógica compleja de tipo: (Q1:Yes,AND,Q2:No),OR,(Q3:Yes)
 * PUNTO 13 del Checklist
 */
export const evaluateComplexLogic = (
  logicStr: string, 
  responses: Record<string, ItemResponse>,
  optimistic: boolean = false // Si es true, las respuestas vacías se consideran 'posibles matches'
): boolean => {
  try {
    if (!logicStr) return true;
    let normalized = logicStr.replace(/\s+/g, '');
    
    // 1. Fragmentación por grupos (paréntesis)
    const groups = normalized.match(/\(([^)]+)\)/g) || [normalized];
    const groupOps = normalized.match(/\),([A-Z]+),\(/g)?.map(m => m.split(',')[1]) || [];

    const groupResults = groups.map(group => {
      const content = group.replace(/[()]/g, '');
      const parts = content.split(','); // [ID:VAL, OP, NOT:ID:VAL]
      
      const subResults: boolean[] = [];
      const subOps: string[] = [];

      parts.forEach(p => {
        const up = p.toUpperCase();
        if (up === 'AND' || up === 'OR' || up === 'NOT') {
          subOps.push(up);
        } else {
          // Soporte para NOT:ID:VAL
          let isNegated = false;
          let expression = p;
          if (p.toUpperCase().startsWith('NOT:')) {
            isNegated = true;
            expression = p.substring(4);
          }

          const [id, targetVal] = expression.split(':');
          const resp = responses[normalize(id)];
          const val = resp ? normalize(resp.value) : '';
          const target = normalize(targetVal);

          let match = false;
          // Si estamos en modo optimista y no hay respuesta, asumimos que 'podría set true'
          if (optimistic && !val) {
            match = true;
          } else {
            match = val === target;
          }

          subResults.push(isNegated ? !match : match);
        }
      });

      if (subResults.length === 0) return true;
      let final = subResults[0];
      
      // Aplicar operadores del grupo
      let currentResIdx = 1;
      for (let i = 0; i < subOps.length; i++) {
        const op = subOps[i];
        if (op === 'NOT') {
            // El NOT en este formato suele preceder o ser parte de la expresión, 
            // ya lo manejamos arriba con NOT:ID:VAL. Si es un operador unitario suelto:
            if (currentResIdx < subResults.length) {
                subResults[currentResIdx] = !subResults[currentResIdx];
            }
            continue;
        }
        
        if (currentResIdx < subResults.length) {
            if (op === 'AND') final = final && subResults[currentResIdx];
            if (op === 'OR') final = final || subResults[currentResIdx];
            currentResIdx++;
        }
      }
      return final;
    });

    if (groupResults.length === 0) return true;
    let finalResult = groupResults[0];
    for (let i = 1; i < groupResults.length; i++) {
      const op = groupOps[i-1] || 'AND';
      if (op === 'AND') finalResult = finalResult && groupResults[i];
      if (op === 'OR') finalResult = finalResult || groupResults[i];
    }

    return finalResult;
  } catch (e) {
    console.warn("Error parsing complex logic:", logicStr, e);
    return true; 
  }
};

/**
 * Evalúa una expresión lógica basada en índices de reglas (Punto 25+.1)
 * Ejemplo: ((1 AND 2) OR 3)
 */
export const evaluateNumberedLogic = (
  expression: string,
  ruleResults: boolean[]
): boolean => {
  try {
    if (!expression || ruleResults.length === 0) return true;
    
    // 1. Normalizar: añadir espacios alrededor de dígitos para que los límites de palabra
    //    funcionen aunque el usuario escriba "(1or2)and3" sin espacios.
    let s = expression.toLowerCase()
      .replace(/(\d+)/g, ' $1 ')   // espacio alrededor de cada número
      .replace(/\s+/g, ' ')        // colapsar espacios múltiples
      .trim();

    // 2. Reemplazar números por sus resultados (de atrás hacia adelante para evitar colisiones 10 -> 1)
    for (let i = ruleResults.length; i >= 1; i--) {
      const regex = new RegExp(`\\b${i}\\b`, 'g');
      s = s.replace(regex, ruleResults[i-1].toString());
    }

    // 3. Limpiar espacios extras después de la sustitución
    s = s.replace(/\s+/g, '');

    // 4. Resolución recursiva de paréntesis con protección MAXIMA
    let iterations = 0;
    const MAX_ITERATIONS = 50;

    const resolve = (str: string): boolean => {
      iterations++;
      if (iterations > MAX_ITERATIONS) return false; // Fail safe

      let current = str.trim().toLowerCase();
      if (current === '' || current === 'true') return true;
      if (current === 'false') return false;
      
      // 3.1 Resolver paréntesis primero
      let lastStr = '';
      while (current.includes('(') && current !== lastStr && iterations < MAX_ITERATIONS) {
        lastStr = current;
        current = current.replace(/\(([^()]+)\)/g, (_, sub) => resolve(sub).toString());
        iterations++;
      }

      // 3.2 Limpieza de residuos
      if (current.includes('(') || current.includes(')')) return false;
      
      // 3.3 Resolver ORs (prioridad baja)
      if (current.includes('or')) {
        const parts = current.split('or');
        for (const p of parts) {
           if (resolve(p)) return true;
        }
        return false;
      }
      
      // 3.4 Resolver ANDs (prioridad alta)
      if (current.includes('and')) {
        const parts = current.split('and');
        for (const p of parts) {
           if (!resolve(p)) return false;
        }
        return true;
      }

      // 3.5 Valor base / NOT
      if (current.startsWith('not')) {
        return !resolve(current.substring(3));
      }

      return current === 'true';
    };

    return resolve(s);
  } catch (e) {
    console.warn("Numbered logic evaluation failed:", expression, e);
    return false;
  }
};

/**
 * Filtra los items que deben ser visibles basándose en reglas lógicas AND/OR/NOT.
 */
export const getVisibleItems = (
  allItems: StandardItem[], 
  responses: Record<string, ItemResponse>
): StandardItem[] => {
  return allItems.filter(item => {

    // SI HAY LOGIC STRING (Nuevas reglas de visibilidad Punto 25)
    if (item.logicString && item.logicString.trim().length > 0) {
      try {
        // Only use evaluateNumberedLogic when the string is truly in numbered format
        // (digits + AND/OR/NOT/parentheses). Old-format strings like "Q1:ANY AND Q2:Yes"
        // must NOT be passed to evaluateNumberedLogic because it replaces digit substrings
        // ('1' in 'Q1', '2' in 'Q2') with boolean values, breaking all logic evaluation.
        const hasNumberedRules = item.dependencyRules && item.dependencyRules.length > 0 && isNumberedLogicFormat(item.logicString);

        if (hasNumberedRules) {
           const ruleMetArray = item.dependencyRules!.map(rule => checkDependency(rule, responses));
           // Evaluación estricta: cuando hay logicString explícita el ítem se oculta
           // hasta que la condición se cumpla realmente (sin fallback optimista).
           return evaluateNumberedLogic(item.logicString, ruleMetArray);
        } else {
          // Lógica antigua ID:VAL (or any non-numbered format)
          const normalizedResponses: Record<string, ItemResponse> = {};
          Object.keys(responses).forEach(k => {
            normalizedResponses[normalize(k)] = responses[k];
          });
          return evaluateComplexLogic(item.logicString, normalizedResponses, false) || evaluateComplexLogic(item.logicString, normalizedResponses, true);
        }
      } catch (err) {
        return true;
      }
    }

    if (!item.dependencyRules || item.dependencyRules.length === 0) {
      return true;
    }

    // Reglas simples: Fail-open si los padres no están respondidos
    const anyTargetAnswered = item.dependencyRules.some(r => {
      const resp = responses[r.targetId];
      return resp && (resp.status === 'answered' || resp.status === 'confirmed');
    });

    if (!anyTargetAnswered) return true;

    const { dependencyOperator = 'AND' } = item;
    const results = item.dependencyRules.map(rule => checkDependency(rule, responses));

    if (dependencyOperator === 'AND') {
      // Si es AND, lo ocultamos SOLO si hay una evidencia explícita de fallo (puerta cerrada)
      const anyExplicitFalse = item.dependencyRules.some((r, i) => {
          const resp = responses[r.targetId];
          const isAnswered = resp && (resp.status === 'answered' || resp.status === 'confirmed');
          return isAnswered && !results[i];
      });
      return !anyExplicitFalse;
    } else if (dependencyOperator === 'OR') {
      const anyTrue = results.some(res => res === true);
      const allDefinitivelyFalse = item.dependencyRules.every((r, i) => {
          const resp = responses[r.targetId];
          const isAnswered = resp && (resp.status === 'answered' || resp.status === 'confirmed');
          return isAnswered && !results[i];
      });
      return anyTrue || !allDefinitivelyFalse;
    } else if (dependencyOperator === 'NOT') {
      return !results.some(res => res === true);
    }

    return true;
  });
};

/**
 * Genera el estado del "Semáforo" por área basado en preguntas visibles.
 * Lógica (Punto 21 del Checklist):
 * Red: Hay obligatorias visibles sin responder.
 * Yellow: Hay pendientes visibles ordinarios.
 * Green: Todo lo visible está contestado.
 * Gray: Sin ítems activos o visor vacío.
 */
export const getAreaStatus = (
  visibleItems: StandardItem[], 
  responses: Record<string, ItemResponse>
) => {
  const allAreas = [...new Set(visibleItems.map(i => i.area))];
  
  return allAreas.map(area => {
    const areaVisibleItems = visibleItems.filter(i => i.area === area);
    
    if (areaVisibleItems.length === 0) {
      return { area, color: 'gray', percentage: 0 };
    }

    const unanswered = areaVisibleItems.filter(i => {
      const resp = responses[i.id];
      return !resp || (resp.status !== 'answered' && resp.status !== 'confirmed');
    });

    const hasUnansweredMandatory = unanswered.some(i => i.mandatory || i.priority === 'mandatory');
    const isFullyAnswered = unanswered.length === 0;

    let color: 'red' | 'yellow' | 'green' | 'gray' = 'green';
    if (hasUnansweredMandatory) {
      color = 'red';
    } else if (!isFullyAnswered) {
      color = 'yellow';
    }

    const answeredCount = areaVisibleItems.length - unanswered.length;
    const percentage = Math.round((answeredCount / areaVisibleItems.length) * 100);

    return { 
      area, 
      color, 
      answered: answeredCount, 
      total: areaVisibleItems.length, 
      percentage 
    };
  });
};

export const getStageStatus = (
  visibleItems: StandardItem[], 
  responses: Record<string, ItemResponse>
) => {
  const allStages = [...new Set(visibleItems.map(i => i.stage))];
  
  return allStages.map(stage => {
    const stageVisibleItems = visibleItems.filter(i => i.stage === stage);
    if (stageVisibleItems.length === 0) return { stage, color: 'gray', percentage: 0 };

    const unanswered = stageVisibleItems.filter(i => {
      const resp = responses[i.id];
      return !resp || (evaluateStatus(resp) !== 'answered' && evaluateStatus(resp) !== 'confirmed');
    });

    const isFullyAnswered = unanswered.length === 0;
    const answeredCount = stageVisibleItems.length - unanswered.length;
    const percentage = Math.round((answeredCount / stageVisibleItems.length) * 100);

    return { 
      stage, 
      color: isFullyAnswered ? 'green' : (percentage > 0 ? 'yellow' : 'gray'), 
      answered: answeredCount, 
      total: stageVisibleItems.length, 
      percentage 
    };
  });
};

/**
 * Evalúa si una respuesta individual cuenta como 'respondida' (Punto 29)
 * Filtra valores vacíos o espacios como 'not_started'
 */
export const evaluateStatus = (
  response: Partial<ItemResponse> | undefined
): ResponseStatus => {
  if (!response) return 'not_started';
  const val = String(response.value || '').trim();
  if (val === '') return 'not_started';
  return response.status || 'answered';
};

/**
 * Evalúa si una etapa está bloqueada por mandatorios de etapas anteriores (Gating Logic)
 */
export const isStageLocked = (
  stageName: string,
  allItems: StandardItem[],
  stages: string[],
  responses: Record<string, ItemResponse>
): boolean => {
  const currentStageIndex = stages.indexOf(stageName);
  if (currentStageIndex <= 0) return false; // La primera etapa nunca está bloqueada por previas

  // Buscar todas las etapas anteriores
  const previousStages = stages.slice(0, currentStageIndex);
  
  // Revisar si en alguna etapa previa hay mandatorios no respondidos
  const previousMandatories = allItems.filter(i => 
    previousStages.includes(i.stage) && (i.mandatory || i.priority === 'mandatory')
  );

  return previousMandatories.some(i => {
    const resp = responses[i.id];
    return !resp || (resp.status !== 'answered' && resp.status !== 'confirmed');
  });
};

/**
 * Evalúa si un item específico está bloqueado por sus propias reglas de dependencia (Punto 24)
 */
export interface LockReason {
  targetId: string;
  operator: string;
  expectedValue?: any;
}

export const isItemLocked = (
  item: StandardItem,
  responses: Record<string, ItemResponse> = {}
): { locked: boolean; reasons?: LockReason[] } => {
  if (!item || !item.dependencyRules || item.dependencyRules.length === 0) return { locked: false };

  const { dependencyOperator = 'AND' } = item;
  const results = item.dependencyRules.map(rule => ({
    rule,
    met: checkDependency(rule, responses || {})
  }));

  let isLocked = false;
  if (item.logicString && item.logicString.trim().length > 0 && isNumberedLogicFormat(item.logicString)) {
    // Si hay una cadena de lógica numerada (Punto 25+.2)
    // Guard: only call evaluateNumberedLogic for actual numbered-format strings.
    const ruleMetArray = results.map(r => r.met);
    isLocked = !evaluateNumberedLogic(item.logicString, ruleMetArray);
  } else if (dependencyOperator === 'AND') {
    isLocked = results.some(r => !r.met);
  } else if (dependencyOperator === 'OR') {
    isLocked = !results.some(r => r.met);
  } else if (dependencyOperator === 'NOT') {
    isLocked = results.some(r => r.met);
  }

  if (isLocked) {
     const reasons = results.filter(r => !r.met).map(r => ({
        targetId: r.rule.targetId,
        operator: r.rule.operator,
        expectedValue: r.rule.value
     }));
     return { locked: true, reasons };
  }

  return { locked: false };
};
