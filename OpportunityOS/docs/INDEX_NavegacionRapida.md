# Índice de navegación rápida

## Repositorio

| Necesidad | Ubicación |
| --- | --- |
| Primer uso e instalación | `README.md` en la raíz |
| Flujo de Git y revisión previa a publicar | `OpportunityOS/docs/GIT_MANUAL.md` |
| Arquitectura general | `OpportunityOS/docs/architecture.md` |

## OpportunityOS

| Necesidad | Ubicación |
| --- | --- |
| Punto de entrada React | `OpportunityOS/src/index.tsx` |
| Estado y orquestación | `OpportunityOS/src/App.tsx` |
| Expediente | `OpportunityOS/src/components/OpportunityDetail.tsx` |
| Dashboard | `OpportunityOS/src/components/Dashboard.tsx` |
| Tipos de datos | `OpportunityOS/src/types.ts` |
| Acceso a archivos | `OpportunityOS/src/services/fileSystem.ts` |
| Servicio local | `OpportunityOS/server/index.ts` |
| Pruebas de persistencia | `OpportunityOS/scripts/verify-folder-persistence.ts` |

## TenderFlow

TenderFlow es una aplicación independiente, no un submódulo de OpportunityOS.

| Necesidad | Ubicación |
| --- | --- |
| Punto de entrada | `TenderFlow/src/index.tsx` |
| Vista principal | `TenderFlow/src/components/FlowDashboard.tsx` |
| Motor de reglas | `TenderFlow/src/engine/evaluator.ts` |
| Tipos | `TenderFlow/src/types/index.ts` |
| Importación Excel | `TenderFlow/src/services/excelParser.ts` |

## Validación

Ejecuta los comandos desde la carpeta de cada aplicación:

```powershell
cd OpportunityOS
npm run build
npm run check:server
npm run check:folder

cd ..\TenderFlow
npm run build
```

No guardes información de oportunidades ni exportaciones dentro del repositorio.
