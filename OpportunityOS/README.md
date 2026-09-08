# Tender Control

Aplicación local de gestión de oportunidades de licitación (tendering). Administra
expedientes, tareas, notas, indicadores, calendario, documentos y reportes para
responsables de área. Toda la información se guarda en una base de datos local
elegida por el usuario; no se transmite nada fuera de su equipo.

---

## Contenido

1. [Inicio rápido para usuarios (Windows)](#inicio-rápido-para-usuarios-windows)
2. [Actualizaciones](#actualizaciones)
3. [Arquitectura y stack tecnológico](#arquitectura-y-stack-tecnológico)
4. [Estructura del proyecto](#estructura-del-proyecto)
5. [Módulos del frontend](#módulos-del-frontend)
6. [Módulos del backend local](#módulos-del-backend-local)
7. [Servicios del frontend](#servicios-del-frontend)
8. [Scripts y utilidades](#scripts-y-utilidades)
9. [Comandos npm disponibles](#comandos-npm-disponibles)
10. [Variables de entorno](#variables-de-entorno)
11. [Datos y privacidad](#datos-y-privacidad)
12. [Documentación relacionada](#documentación-relacionada)

---

## Inicio rápido para usuarios (Windows)

1. Recibe el paquete publicado por el responsable de Tender Control y extráelo
   completo en una ruta corta, por ejemplo `C:\Tenderloop`.
2. Instala **Node.js 18** o una versión LTS posterior.
3. En la carpeta `OpportunityOS`, abre **`OPEN_OPPORTUNITYOS.vbs`**.

Si Windows bloquea los archivos VBS, usa `OPEN_OPPORTUNITYOS.bat`. En el primer
inicio el launcher instala las dependencias automáticamente; no es necesario
ejecutar `npm install` manualmente para usar la aplicación.

La aplicación se abre en **`http://127.0.0.1:3000`**. El servicio local de
archivos corre en el puerto **`3099`**.

Para abrirla como una pestaña del navegador usa `OPEN_OPPORTUNITYOS_BROWSER.vbs`
o `OPEN_OPPORTUNITYOS_BROWSER.bat`. Para cerrar la aplicación y liberar sus
puertos, ejecuta `CLOSE_OPPORTUNITYOS.bat`.

---

## Actualizaciones

Cada usuario puede configurar una carpeta de SharePoint sincronizada en
**Settings › General › Application updates**. Sin carpeta configurada, Tender
Control funciona normalmente. Al abrir, el launcher valida e instala cualquier
versión más reciente y restaura la anterior si algo falla.

Para publicar una nueva versión:

1. Actualiza `version` en `package.json`.
2. Ejecuta `PUBLICAR_ACTUALIZACION.bat`. El proceso valida el proyecto, pregunta
   dónde guardar la entrega y genera el ZIP junto con `latest.json`.

---

## Arquitectura y stack tecnológico

Tender Control es una **aplicación de escritorio empaquetada como PWA** que combina
un frontend React con un servidor Express local sin conexión a internet.

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend UI | **React 19** + TypeScript | ^19.2 |
| Bundler / Dev server | **Vite 6** | ^6.2 |
| Estilos | **TailwindCSS v4** (vía plugin Vite) | ^4.2 |
| Iconografía | **Lucide-React** | ^0.561 |
| Backend local | **Express 5** con `tsx` | ^5.2 |
| Automatización web | **Playwright Core** (Chromium) | ^1.62 |
| Generación PDF | **jsPDF** + **jsPDF-AutoTable** | ^4.2 / ^5.0 |
| Generación DOCX | **docx** | ^9.6 |
| Lectura Excel | **xlsx** | ^0.18 |
| Lectura emails `.msg` | **@kenjiuno/msgreader** | ^1.28 |
| Conversión DOCX→HTML | **mammoth** | ^1.12 |
| XML / HTML parsing | **@xmldom/xmldom** | 0.8.13 |
| Sanitización HTML | **DOMPurify** | ^3.4 |
| Tipografía | **Inter** vía `@fontsource/inter` | ^5.2 |
| PWA (service worker) | **vite-plugin-pwa** | ^1.3 |
| Iconos | **sharp** + **png-to-ico** (build-time) | ^0.35 / ^3.0 |
| Utilerías | **underscore** | 1.13.8 |

La base de datos es un archivo **JSON** gestionado por el usuario (la app lo lee
con la File System Access API del navegador). El servidor local actúa de puente
para operaciones que el navegador no puede hacer directamente: guardar archivos,
abrir carpetas, leer correos `.msg` y `.eml`, controlar el temporizador y la
automatización web.

---

## Estructura del proyecto

```
OpportunityOS/
├── src/                   # Frontend React + TypeScript
│   ├── App.tsx            # Raíz de la app, routing y estado global
│   ├── types.ts           # Todos los tipos TypeScript del dominio
│   ├── index.css          # Tokens de diseño y utilidades globales
│   ├── index.tsx          # Entry point React
│   ├── ambient.d.ts       # Declaraciones de módulo para activos
│   ├── components/        # Componentes grandes de UI
│   ├── features/          # Funcionalidades autocontenidas
│   ├── services/          # Lógica de negocio y acceso a datos
│   └── contexts/          # Contextos React (tema, DB, etc.)
├── server/                # Servidor Express local (puerto 3099)
│   ├── index.ts           # Entrada del servidor, registro de rutas
│   ├── config.ts          # Variables de entorno y puertos
│   ├── routes/            # Rutas Express por dominio
│   ├── db/                # Acceso y caché de la base de datos
│   └── os/                # Integraciones con el sistema operativo
├── scripts/               # Utilidades de build, íconos y comprobaciones
├── public/                # Activos estáticos (icon.svg, manifest.webmanifest)
├── docs/                  # Documentación técnica y de usuario
├── OPEN_OPPORTUNITYOS.vbs / .bat            # Launcher principal (sin ventana cmd)
├── OPEN_OPPORTUNITYOS_BROWSER.vbs / .bat   # Abre en pestaña de navegador
├── CLOSE_OPPORTUNITYOS.bat                  # Cierra app y libera puertos
├── INSTALAR_OPPORTUNITYOS.hta / .vbs       # Instalador guiado
├── DESINSTALAR_OPPORTUNITYOS.hta/.vbs/.bat # Desinstalador
├── GRABAR_BFO.bat                           # Graba selectores BFO para automatización
├── PUBLICAR_ACTUALIZACION.bat               # Publica versión empaquetada
├── engine_opportunityos.bat                 # Motor interno del launcher
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Módulos del frontend

### `src/App.tsx`
Raíz de la aplicación. Administra:
- **Apertura y selección de la base de datos** — usa la File System Access API
  para abrir el archivo JSON local o crear uno nuevo.
- **Estado global de oportunidades** — carga, guarda y refresca la lista de
  oportunidades con auto-guardado en web worker.
- **Navegación entre vistas** — Dashboard, Expediente, Calendario, Indicadores,
  Tutorial interactivo, Quick Organizer y Configuración.
- **Integración con el servidor local** — detecta si el backend Express está
  disponible y habilita o deshabilita funciones OS-dependientes.
- **Sincronización de actualizaciones** — consulta `latest.json` en la carpeta
  de SharePoint configurada y aplica la actualización si hay una versión más nueva.

### `src/types.ts`
Define **todos los tipos TypeScript** del dominio:

| Tipo | Descripción |
|---|---|
| `Opportunity` | Oportunidad completa con expediente, tareas, notas y metadatos |
| `Task` / `TaskStandard` | Tarea individual y lista de tareas estándar con secciones |
| `MeetingNote` | Nota de reunión o entrada del registro de reuniones |
| `SowField` | Campo del Statement of Work (SOW) tipado |
| `ApprovalEvent` / `ApprovalStage` | Etapas y eventos del flujo de aprobación |
| `Reminder` | Recordatorio vinculado a oportunidad, tarea o nota |
| `StickyNote` | Nota adhesiva del dashboard |
| `QuickLink` | Acceso rápido a URL o ruta de archivo |
| `ManagerReport` | Snapshot de reporte para el responsable |
| `TimerSession` | Sesión del temporizador Pomodoro |
| `TeamMember` | Miembro del equipo con rol y área |
| `ScopeLabel` | Etiqueta de alcance/scope con sección y color |
| `BfoSelector` | Selector grabado para automatización web (BFO) |

### `src/components/Dashboard.tsx`
Vista principal de la lista de oportunidades. Incluye:
- **Tabla general** con filtros avanzados: alcance (scope), duración, rango, estado,
  etiquetas y búsqueda de texto libre.
- **Widgets del dashboard**: temporizador Pomodoro, notas adhesivas, accesos rápidos,
  indicadores de proceso y radial de estado.
- **Vista de calendario** integrada con las fechas de entrega de oportunidades.
- **Panel de indicadores** con métricas de proceso (win rate, tiempo promedio, etc.).
- **Dock de navegación rápida** (QuickNavDock) para acceso a oportunidades recientes.

### `src/components/OpportunityDetail.tsx`
Vista de detalle (expediente) de una oportunidad. Es el componente más grande de la
aplicación. Contiene:
- **Cabecera** con número de oportunidad, alias, estado, cliente y fechas.
- **Pestañas del expediente**: Resumen, Tareas, Notas, SOW, Documentos, Historial,
  Automatización web, Timeline de workflow.
- **Gestión de tareas** con listas estándar, copia de tareas, fechas de completación
  y seguimiento de horas trabajadas.
- **Registro de reuniones** (meeting notes) con soporte para notas ocultas y
  vinculación a recordatorios.
- **Visor y editor del SOW** (Statement of Work) con plantilla embebida.
- **Historial de aprobaciones** con etapas, responsables y evidencias.
- **Timeline Gantt** por tarea y área con resúmenes diarios.
- **Panel de automatización web** para controlar el navegador en el portal BFO.

### `src/components/SettingsModal.tsx`
Modal de configuración global. Secciones:
- **General** — nombre del responsable, versión instalada, carpeta de actualizaciones.
- **Equipo** — gestión de miembros del equipo (nombre, rol, área).
- **Etiquetas / Scope** — editor del catálogo de etiquetas por sección.
- **Accesos rápidos** — configuración de quick links (URL o ruta, ícono, color).
- **Notificaciones** — volumen y sonido de recordatorios.
- **Automatización web** — hosts permitidos y política de selectores BFO.
- **Base de datos** — ruta activa, copia de seguridad y exportación.

### `src/components/EmailComposeModal.tsx`
Redactor de correo electrónico con plantillas. Permite:
- Seleccionar una plantilla (SR, revisión, aprobación, etc.).
- Completar destinatarios, CC, asunto y cuerpo con campos pre-rellenados.
- Generar el enlace `mailto:` para abrir el cliente de correo del sistema.
- Exportar el borrador como archivo `.eml`.

### `src/components/ImportSrEmailModal.tsx`
Importa un correo `.msg` o `.eml` de solicitud de revisión (SR) a la base de datos:
- Detecta duplicados por número de OP y ofrece crear una **nueva revisión** o
  continuar como oportunidad nueva.
- Extrae campos estructurados con `srEmailParser.ts`.

### `src/components/ScopeQuickViewModal.tsx`
Vista rápida del alcance de una oportunidad. Muestra etiquetas agrupadas por sección
(tipo de propuesta, sistemas, notas a primera vista, extras) con búsqueda y exportación.
Incluye el resumen automático del SOW generado por `scopeSummary.ts`.

### `src/components/RemindersBell.tsx`
Campana de recordatorios en la cabecera. Muestra contador de pendientes, vencidos y
próximos. Abre el panel de recordatorios con navegación directa al elemento vinculado
y soporte para notificaciones del navegador (Web Notifications API) y sonido.

### `src/components/InteractiveTutorial.tsx`
Tutorial paso a paso integrado. Guía al usuario por las funciones principales con
resaltado contextual de elementos de la UI y flujo de bienvenida para nuevos usuarios.

### `src/components/CalendarView.tsx`
Vista de calendario mensual que muestra oportunidades por fecha de entrega. Filtra
por estado y navega entre meses. Al hacer clic en un día muestra las oportunidades
con vencimiento ese día.

### `src/components/TimerWidget.tsx`
Widget del temporizador Pomodoro embebido en el Dashboard:
- Ciclos configurables de trabajo / descanso corto / descanso largo.
- Registro de sesiones vinculadas a una oportunidad y tarea.
- Ventana flotante independiente (popup) sincronizada por timestamps absolutos.
- Opción de mantener la ventana siempre al frente (pin topmost) vía `/api/os/timer-window-topmost`.

### `src/components/StickyNotesWidget.tsx`
Panel de notas adhesivas del Dashboard. Las notas se guardan en la base de datos JSON
(no en `localStorage`), sobreviven a reinicios y son accesibles desde cualquier máquina
que comparta la misma base de datos. Incluye buscador y cierre con `Escape`.

### `src/components/IndicatorsDashboard.tsx`
Panel de indicadores de proceso. Calcula métricas de desempeño: oportunidades por
estado, tiempos promedio, win rate y distribución por área o tipo.

### `src/components/TableComponents.tsx`
Componentes reutilizables de tabla: cabeceras ordenables, filtros por columna tipo
Excel, paginación y celdas editables inline.

### `src/components/scopeCatalog.ts`
Catálogo de etiquetas de alcance predefinidas y funciones para importar, exportar y
validar el catálogo desde la base de datos. Define las secciones estándar (tipo,
sistemas, notas, extras) y los colores por defecto.

### `src/components/StandardTasks.ts`
Definición de las listas de tareas estándar por tipo de oportunidad. Cada lista
contiene secciones y tareas predefinidas con pesos y responsables sugeridos.

### `src/components/MeetingTemplates.ts`
Plantillas de reunión predefinidas con secciones, puntos de agenda y formato de acta.

### `src/features/opportunity-folder/`
Funcionalidad de vinculación de carpetas a oportunidades:
- **`OpportunityFolderTab.tsx`** — pestaña "Documentos" del expediente. Muestra el
  árbol de archivos de la ruta vinculada, permite navegar, abrir archivos con la
  aplicación nativa del sistema y anclar subcarpetas favoritas.
- **`fileOps.ts`** — operaciones sobre el sistema de archivos: listar directorios,
  abrir archivos/carpetas y resolver rutas relativas.

### `src/features/quickOrganizer/`
Flujo de organización rápida de carga de trabajo:
1. Exporta el contexto actual (tareas pendientes, recordatorios, disponibilidad)
   como prompt de texto para revisión externa.
2. Importa la respuesta revisada en formato JSON estructurado.
3. Previsualiza la agenda semanal resultante, ajustes de fechas y recordatorios.
4. Aplica cambios solo tras confirmación explícita del usuario.

### `src/features/reminders/`
Sistema de recordatorios vinculados a oportunidades, tareas o notas:
- Persistencia en la base de datos JSON.
- Estados: pendiente, completado, vencido.
- Navegación directa al elemento vinculado desde el recordatorio.
- Notificaciones del navegador con sonido configurable.

### `src/features/schedule/`
Vista de agenda por semana/día con bloques de tiempo planificados y resumen de
horas trabajadas por oportunidad y área.

### `src/features/tracking/`
Seguimiento de horas trabajadas por oportunidad. Acumula sesiones del temporizador
y entradas manuales para reportes de tiempo.

### `src/features/opportunity-export/`
Exportación de oportunidades individuales: genera un archivo JSON portable con todos
los datos del expediente, apto para importar en otra instalación de Tender Control.

### `src/features/doc-links/`
Gestión de vínculos a documentos externos (SharePoint, red local, OneDrive)
asociados a una oportunidad.

---

## Módulos del backend local

El servidor Express corre en `localhost:3099` y solo acepta peticiones del propio
equipo. Se inicia con `npm run server` o automáticamente por el launcher.

### `server/index.ts`
Punto de entrada. Registra todas las rutas, aplica CORS restringido al origen local,
configura el manejo de errores y arranca el servidor en el puerto 3099.

### `server/config.ts`
Lee variables de entorno y define constantes:
- Puertos (`3000` frontend, `3099` backend).
- Hosts permitidos para automatización web.
- Flags de desactivación de módulos opcionales.

### `server/routes/`

| Archivo | Prefijo | Función |
|---|---|---|
| `db.ts` | `/api/db` | Leer, escribir y hacer backup del archivo de base de datos JSON |
| `os.ts` | `/api/os` | Operaciones del SO: abrir rutas, controlar la ventana, timer topmost, Outlook |
| `web.ts` | `/api/web` | Automatización web con Playwright (login, probe, status, close) |

### `server/db/`
Caché en memoria de la base de datos JSON. Evita lecturas redundantes y gestiona
conflictos de escritura concurrente (control de revisiones, responde 409 si la
base de datos cambió en otro proceso).

### `server/os/webAutomation.ts`
Inicia y controla Chromium con Playwright. Gestiona una sesión persistente en el
perfil `%APPDATA%\OpportunityOS\web-profile`. La app nunca ve, almacena ni teclea
credenciales; el usuario hace el login por SSO/MFA una vez y la sesión persiste.

### `server/os/recorderScript.ts`
Inyecta el script grabador de selectores BFO en la página activa, captura clics
y campos y genera el archivo de selectores para la automatización web.

---

## Servicios del frontend

Los servicios en `src/services/` encapsulan la lógica de negocio y el acceso a datos.

| Archivo | Función |
|---|---|
| `backendDb.ts` | Cliente HTTP para todas las llamadas al servidor Express (leer DB, escribir DB, backup) |
| `scopeSummary.ts` | Extrae un resumen estructurado del SOW: scope, sistemas, fechas clave, equipo y etiquetas. Alimenta la vista rápida de scope y la búsqueda |
| `sowTemplate.html` | Plantilla HTML completa del Statement of Work embebida. Se carga en el iframe del editor SOW |
| `sowTemplate.ts` | Exporta la URL o contenido de la plantilla SOW para el editor |
| `emailComposer.ts` | Genera el cuerpo HTML, asunto y destinatarios de los correos según la plantilla y los datos de la oportunidad |
| `emailTemplates.ts` | Define las plantillas de correo disponibles: SR, revisión, aprobación, cierre, etc. |
| `emailFileReader.ts` | Lee archivos `.msg` (Outlook) con `msgreader` y archivos `.eml` para extraer cabeceras y cuerpo |
| `emailDraftService.ts` | Guarda y recupera borradores de correo vinculados a una oportunidad |
| `srEmailParser.ts` | Parsea el cuerpo de un correo de SR para extraer número de OP, cliente, alcance, fechas y equipo |
| `opportunityFolderStore.ts` | Almacena y recupera la ruta de carpeta vinculada a cada oportunidad. Migra rutas de versiones anteriores |
| `opportunityFolderLink.ts` | Vinculación robusta de carpetas: busca por marcador, nombre y hash con reintentos ante fallos de Windows Search |
| `opportunityExportImport.ts` | Serializa y deserializa oportunidades para exportación/importación portable |
| `opportunityDocMetaStore.ts` | Metadatos de documentos vinculados (nombre, tipo, última modificación) |
| `executionModel.ts` | Modela el plan de ejecución: fases, hitos, tareas por área, cálculo de progreso y proyección de fechas |
| `taskUtils.ts` | Normalización, cálculo de progreso, filtrado, ordenación y migración de campos de tareas |
| `taskProgress.ts` | Calcula el porcentaje de completación de una tarea o lista de tareas |
| `noteUtils.ts` | Ordenación, filtrado y extracción de campos de notas de reunión |
| `historyUtils.ts` | Construye el feed histórico unificado de una oportunidad (tareas, aprobaciones, notas) |
| `managerReport.ts` | Genera el snapshot de reporte para el responsable de área |
| `managerReportSync.ts` | Sincroniza el reporte del responsable con la carpeta de SharePoint configurada |
| `fileRevisionHistoryStore.ts` | Historial de revisiones de archivos vinculados (versión y timestamp) |
| `fileSystem.ts` | Wrappers sobre la File System Access API del navegador para abrir, leer y escribir archivos |
| `folderPinsStore.ts` | Almacena las subcarpetas ancladas (favoritas) por oportunidad |
| `recentDbHandles.ts` | Lista de archivos de base de datos usados recientemente para el selector de apertura |
| `changeRevisionFiles.ts` | Copia tareas, notas y archivos vinculados al cambiar de revisión en una oportunidad |
| `processSections.ts` | Define las secciones del proceso de licitación usadas en indicadores y filtros |
| `sanitizeHtml.ts` | Sanitiza HTML externo antes de renderizarlo (usa DOMPurify) |
| `save.worker.ts` | Web Worker que ejecuta el auto-guardado periódico sin bloquear el hilo principal |
| `soundService.ts` | Reproduce sonidos de notificación (recordatorios, fin de Pomodoro) con control de volumen |
| `sowTeamMembers.ts` | Extrae los miembros del equipo definidos en el SOW de una oportunidad |
| `dateUtils.ts` | Formateo, diferencia en días, validación y normalización de fechas |

---

## Scripts y utilidades

| Archivo | Función |
|---|---|
| `scripts/generate-icon.mjs` | Genera `public/icon.png` (256×256) y `opportunityos.ico` (multi-resolución) a partir de `public/icon.svg` usando `sharp` y `png-to-ico` |
| `scripts/verify-folder-persistence.ts` | Comprueba que las rutas de carpeta vinculadas se guardan y recuperan correctamente (`npm run check:folder`) |
| `scripts/verify-bfo-selectors.ts` | Valida los selectores BFO grabados contra la estructura real de la página (`npm run check:bfo`) |
| `scripts/verify-scope-summary.ts` | Verifica que el extractor de scope summary produce campos completos (`npm run check:scope`) |
| `scripts/toggle-app-window.ps1` | Detecta si la ventana de Tender Control está abierta y la restaura/enfoca o la minimiza. Usado por el launcher VBS |
| `scripts/find-chrome-app-id.ps1` | Busca el app-id de la Chrome App instalada para que el launcher reusar su identidad de barra de tareas |
| `GRABAR_BFO.bat` | Abre una sesión de grabación de selectores BFO, inyecta el grabador y guarda `bfo-selectors.json` |
| `PUBLICAR_ACTUALIZACION.bat` | Valida el proyecto, solicita la carpeta de destino y genera el ZIP versionado con `latest.json` |
| `engine_opportunityos.bat` | Motor interno del launcher: comprueba Node.js, instala dependencias si faltan, arranca Vite y Express y aplica actualizaciones |

---

## Comandos npm disponibles

```powershell
# Desarrollo
npm run dev           # Inicia Vite en modo desarrollo (puerto 3000)
npm run server        # Inicia el servidor Express local (puerto 3099)

# Verificación y build
npm run build         # Genera el bundle de producción en /dist
npm run check:server  # Type-check del servidor (tsc --noEmit)
npm run check:folder  # Verifica persistencia de carpetas vinculadas
npm run check:bfo     # Valida selectores BFO grabados
npm run check:scope   # Verifica extractor de scope summary

# Iconos
npm run icon:build    # Regenera icon.png y opportunityos.ico desde icon.svg
```

---

## Variables de entorno

Todas son opcionales. Sin ellas la aplicación arranca con todo activo.

| Variable | Efecto |
|---|---|
| `TENDERLOOP_DISABLE_OS=1` | Desactiva las rutas del sistema operativo (`/api/os/*`) |
| `OPPORTUNITYOS_DISABLE_WEB=1` | Desactiva la automatización web (`/api/web/*`) |
| `OPPORTUNITYOS_WEB_HOSTS` | Hosts adicionales permitidos para automatización web, separados por comas |

---

## Datos y privacidad

- No subas bases de datos locales, exportaciones de oportunidades ni reportes
  de responsables al repositorio.
- Usa los mecanismos de exportación de la aplicación para compartirlos mediante
  el canal autorizado por tu equipo.
- La automatización web nunca ve, almacena ni introduce credenciales: el usuario
  hace el login por SSO/MFA una vez en la ventana del navegador y la sesión
  persiste en el perfil local.

---

## Documentación relacionada

- [Manual de usuario](docs/MANUAL_USUARIO.md)
- [Documentación técnica](docs/TECHNICAL_DOCS.md)
- [Seguridad](docs/security.md)
- [Pruebas](docs/testing.md)
- [Changelog](CHANGELOG.md)
