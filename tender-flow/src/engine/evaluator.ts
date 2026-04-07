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
 * Filtra los items que deben ser visibles basándose en reglas lógicas AND/OR/NOT.
 */
export const getVisibleItems = (
  allItems: StandardItem[], 
  responses: Record<string, ItemResponse>
): StandardItem[] => {
  return allItems.filter(item => {

    // SI HAY LOGIC STRING (Nuevas reglas de visibilidad Punto 25)
    if (item.logicString) {
      try {
        // Normalizar claves de respuestas para búsqueda insensible
        const normalizedResponses: Record<string, ItemResponse> = {};
        Object.keys(responses).forEach(k => {
          normalizedResponses[normalize(k)] = responses[k];
        });

        const isVisibleNow = evaluateComplexLogic(item.logicString, normalizedResponses, false);
        const couldBeVisibleLater = evaluateComplexLogic(item.logicString, normalizedResponses, true);

        // Si es verdadero ahora, se muestra.
        // Si no es verdadero ahora, pero PODRÍA serlo (porque faltan respuestas), lo mostramos como 'futuro'.
        return isVisibleNow || couldBeVisibleLater;
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
  if (dependencyOperator === 'AND') {
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
