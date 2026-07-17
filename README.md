# Beta download and use

The current beta is available from the [`version-beta`](https://github.com/Alan-Merida-R/Tenderloop/tree/version-beta) branch.

1. Download the [beta ZIP](https://github.com/Alan-Merida-R/Tenderloop/archive/refs/heads/version-beta.zip), or select **Code -> Download ZIP** while viewing `version-beta`.
2. Extract the ZIP to a short Windows path such as `C:\TenderLoop`.
3. Install Node.js 18+ (LTS) if it is not already installed.
4. Double-click `ABRIR_TENDERLOOP.vbs`.

`ABRIR_TENDERLOOP.vbs` is the single normal entry point. On first use it hides
the internal launcher and installer files; if setup is incomplete it opens the
installer automatically. Keep `motor_tenderloop.bat` as the visible recovery
option for computers where Windows security blocks the normal launcher.

The first start installs dependencies and then opens the local app. For the complete Windows guide, see [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md). Beta scope and validation notes are in [docs/version-beta.md](docs/version-beta.md).

---

Exit code: 0
Wall time: 1 seconds
Output:
# TenderLoop Ecosystem - Executive Tendering Solution
===================================================

Este repositorio contiene el ecosistema **TenderLoop** (Gestión Operativa) y **Tender Flow** (Matriz Estratégica Ejecutiva), diseñados para optimizar el ciclo de vida completo de las propuestas técnicas de alto nivel.

## 0) TÍTULO + VISIÓN GENERAL

**TenderLoop** es una aplicación de gestión empresarial diseñada para el control exhaustivo de propuestas técnicas y comerciales (**Tendering**). Su objetivo principal es centralizar toda la información de una oportunidad de negocio —desde la recepción del requerimiento hasta la entrega de la propuesta final— en un entorno offline-first y local.

### ¿Para quién está diseñado?
Está diseñado para ingenieros de preventa, gestores de propuestas y equipos técnicos que necesitan manejar múltiples oportunidades simultáneamente, realizar seguimiento de tareas con dependencias y generar métricas de ejecución precisas.

### Problemas que resuelve:
- **Dispersión de información:** Consolida notas, tareas, archivos, KPIs y datos comerciales en un solo "Expediente".
- **Falta de visibilidad:** Proporciona un tablero interactivo (Kanban/Tabla) para ver el estado de todas las propuestas.
- **Seguimiento de tiempos:** Mide automáticamente los días de trabajo real vs. días de espera, facilitando la identificación de cuellos de botella.
- **Dependencia de la nube:** Funciona localmente utilizando archivos JSON como "base de datos", garantizando privacidad y acceso sin conexión.

---

## 1) QUICK START (Para nuevos desarrolladores)

### Requisitos Técnicos:
- **Node.js:** Versión 18 o superior.
- **NPM** o **Yarn** como gestor de paquetes.
- **Navegador Moderno:** (Chrome/Edge recomendado) para soporte de la **File System Access API**.

### Instalación:
1. Clonar el repositorio.
2. Instalar dependencias:
   ```bash
   npm install
   ```

### Ejecución en Desarrollo:
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

### Generación de Build (Producción):
```bash
npm run build
```
Los archivos se generarán en la carpeta `dist/`.

### Configuración Inicial de Base de Datos:
Al abrir la aplicación por primera vez:
1. Verás una pantalla solicitando abrir o crear una base de datos.
2. Haz clic en **Create DB** para generar un archivo `.json` nuevo.
3. Haz clic en **Open DB** para seleccionar un archivo `.json` existente de TenderLoop.
4. Una vez abierta, la aplicación recordará el archivo y guardará los cambios automáticamente.

---

## 2) VISIÓN GENERAL DE ARQUITECTURA

### Tecnologías Principales:
- **Framework:** [React 19](https://react.dev/) con [Typescript](https://www.typescriptlang.org/).
- **Build Tool:** [Vite](https://vitejs.dev/).
- **Estilos:** [Tailwind CSS](https://tailwindcss.com/) (vía CDN en el HTML para máxima portabilidad).
- **Iconografía:** [Lucide React](https://lucide.dev/).
- **Librerías de Datos:** `xlsx` para Excel, `jspdf` para exportación de documentos y `mammoth` para procesamiento de texto.

### Estructura de la Aplicación:
- **Manejo de Estado:** Centralizado en `App.tsx` usando hooks de React (`useState`, `useEffect`, `useRef`). No usa Redux ni Context global, prefiriendo la claridad del prop-drilling directo para esta escala de app.
- **Navegación:** Gestión de vistas mediante el estado `currentView`. El expediente de la oportunidad se maneja como un **Overlay** (capa superior) controlado por `selectedOppId`.
- **Persistencia:**
  - **JSON Local:** Los datos de oportunidades y tareas se guardan en un archivo `.json` seleccionado por el usuario.
  - **IndexedDB:** Se utiliza para guardar metadatos de documentos asociados (`services/opportunityDocMetaStore.ts`).
  - **LocalStorage:** Guarda preferencias de la interfaz (modo oscuro, filtros recientes).

---

## 3) MAPA DE FUNCIONALIDADES (APP FEATURES)

### A. Dashboard (Tablero Principal)
Es el centro de control. Permite alternar entre tres modos:
- **General Overview:** Muestra KPIs agregados, gráficos de evolución (Language Skill, Technical, Probability, Effort) y resúmenes de carga.
- **Proposals Dashboard:** Enfoque en la gestión del pipeline. Incluye:
  - **Board View (Kanban):** Arrastra oportunidades entre etapas del proceso.
  - **Table View:** Edición rápida tipo Excel con selector de columnas.
  - **Calendar View:** Visualiza fechas de entrega esperadas.
- **Tasks Overview:** Enfoque en las acciones pendientes de todos los proyectos.

### B. Opportunity Detail (El Expediente)
Se abre al seleccionar una oportunidad. Contiene las siguientes pestañas:
1. **Overview:** Datos generales (Title, Customer, QLK, SR), descripción del requerimiento y enlaces rápidos (**Quick Links**).
2. **KPI:** Gestión de métricas de calidad. Incluye el **Full Calendar** para registrar días trabajados, en espera o inactivos por área.
3. **Presentation:** Campos de texto para el resumen ejecutivo, problemas detectados y requerimientos (basado en formato PRD).
4. **History:** Log cronológico de eventos relevantes del proyecto.
5. **Tasks (Action Plan):** Gestión de tareas con:
   - **Order & Dependencies:** Controla el orden de ejecución y bloquea estados si las dependencias no están listas.
   - **Subtasks:** Desglose interno de cada tarea.
   - **Linked Docs:** Vincula archivos del sistema local a tareas específicas.
6. **Commercial:** Tabla financiera que separa **SW/HW**, **Services** y **Resale**. Calcula montos finales basados en margen y descuentos.
7. **Notes:** Gestor de notas de reuniones con **Templates** (Kick-off, Scope, etc.) y capacidad de crear **Inline Tasks**.
8. **Opportunity Folder:** Integración con el sistema de archivos local para explorar y previsualizar documentos del proyecto.

### C. Sistema de Versiones
Implementa una lógica de ramas lógicas basadas en el `srId`. Permite crear "Snapshots" y comparar versiones (**Diff View**) para ver qué cambió en tareas o KPIs respecto a la versión "Live".

---

## 4) MODELO DE DATOS / ENTIDADES

### **Opportunity** (Oportunidad)
- **ID:** `OP-XXXXXX` (Único).
- **Metadata:** Title, Customer, QLK, Revision, SR ID.
- **Status:** In Progress, Won, Lost, etc.
- **Lists:** Array de `Task`, `MeetingNote`, `HistoryEntry`.
- **KPIs:** Objeto con métricas (Technical, Language, Deal Probability) y Timeline (Received/Delivered).
- **Commercial:** Desglose de costos y precios de venta oficial (CQA).

### **Task** (Tarea)
- **Campos:** Title, Status (Done/Pending), Priority, Owner (Me/Area), Order, Dependencies.
- **Relaciones:** Puede pertenecer a un `ProcessStage` y estar vinculada a una `MeetingNote`.

### **MeetingNote** (Nota)
- **Campos:** Title, Content (HTML), Attendees, InlineTasks.

---

## 5) BASE DE DATOS / PERSISTENCIA

### Formato de Archivo:
La base de datos es un archivo `.json` con la siguiente estructura raíz:
```json
{
  "meta": { "version": "1.9", "lastUpdated": "..." },
  "userSettings": { "theme": "light", "userName": "..." },
  "opportunities": [...]
}
```

### Mecanismo de Guardado:
- **Autosave:** La aplicación detecta cambios en el estado `db` y ejecuta un guardado automático al disco cada **2 segundos** (usando un debounce para no saturar el sistema).
- **Integridad:** Implementa un `migrateData` en `App.tsx` que asegura que archivos antiguos se actualicen con los campos nuevos requeridos por las versiones recientes.
- **Limitaciones:** Debido a la seguridad del navegador, si la sesión se reinicia, el usuario debe re-autorizar el permiso de escritura al archivo una vez (botón **Change DB**).

---

## 6) MAPA COMPLETO DEL CÓDIGO

### Estructura de Carpetas:
```text
/
├── src/                # Todo el código fuente del frontend.
│   ├── App.tsx             # Corazón de la app: Estado global, DB y Vistas.
│   ├── index.tsx           # Punto de entrada de React (Loop).
│   ├── index_flow.tsx      # Punto de entrada de Flow.
│   ├── types.ts            # Definiciones de Interfaces y Tipos de Datos.
│   ├── components/         # Componentes visuales principales.
│   │   ├── Dashboard.tsx          # Tableros Kanban, Tabla y General.
│   │   ├── OpportunityDetail.tsx  # Lógica del expediente y sus pestañas.
│   │   ├── SettingsModal.tsx      # Configuración de templates y etiquetas.
│   │   └── ...                    # Buscador, Tablas, Calendarios.
│   ├── services/           # Lógica de negocio y utilidades.
│   │   ├── fileSystem.ts          # Comunicación con el Disco (Pickers).
│   │   ├── dateUtils.ts           # Cálculos de días hábiles/festivos.
│   │   ├── opportunityExportImport.ts  # Importación/Exportación parcial.
│   │   └── ...
│   ├── features/           # Módulos especializados e independientes.
│   │   ├── opportunity-folder/    # Gestión de archivos locales.
│   │   ├── doc-links/             # Vínculos entre metadatos y archivos.
│   │   └── tracking/              # Seguimiento de actividad.
│   ├── contexts/           # Contextos de React (timer global).
│   └── tender-flow/        # App Flow (puerto 3003).
├── server/             # Backend local (puerto 3099): DB JSON + integración OS.
├── docs/               # Manuales y documentación técnica.
├── public/             # Assets estáticos.
└── *.bat / *.vbs       # Lanzadores de Windows (deben quedarse en la raíz).
```

---

## 7) RUTAS Y NAVEGACIÓN DE LA UI

La navegación no utiliza una URL tradicional (browser router), sino un **estado de vista interna**:
1. **Inicio:** Pantalla de carga/apertura de base de datos.
2. **Tablero:** Navegación lateral entre **General**, **Proposals** y **Tasks**.
3. **Expediente:** Al hacer clic en el ID o título de una oportunidad, se activa el **selectedOppId**. Esto renderiza `OpportunityDetail` como una capa fija (`fixed inset-0`) sobre el tablero.
4. **Deep Linking:** El sistema permite navegar a pestañas específicas dentro del expediente (ej. abrir directamente las notas) mediante el objeto `DeepLink`.

---

## 8) SISTEMA DE EXPORTACIÓN (PDF / DATA)

### Exportación de Datos (JSON):
- **Bulk Export:** Disponible en la vista de tabla para exportar múltiples oportunidades en un solo archivo comprimido.
- **Single Export:** Dentro de cada oportunidad, descarga un paquete `.json` completo con sus metadatos e historial.

### Exportación de Documentos (PDF):
- Implementado en `OpportunityDetail.tsx` usando `jsPDF`.
- Genera un resumen ejecutivo que incluye:
  - Datos de cabecera.
  - Snapshot de KPIs.
  - Resumen ejecutivo del PRD.
  - Tabla de Plan de Acción (Tareas).
  - Listado de Riesgos y Notas comerciales.

---

## 9) CONTROL DE VERSIONES (GIT)

### Flujo de Ramas:
Se recomienda seguir la siguiente convención para mantener el historial limpio:
- `main`: Versión estable y lista para uso.
- `nueva-funcionalidad/nombre`: Para nuevos módulos (Features).
- `reparacion/nombre`: Para corrección de errores (Bugs).
- `cambio-funcionalidad/nombre`: Para ajustes en lógica existente.

### Comandos Clave:
- **Guardar cambios:** `git commit -m "feat: descripción"` (Usar prefijos `feat:`, `fix:`, `chore:`, `refactor:`).
- **Rollback local:** `git checkout .` descarta cambios no commiteados.
- **Rollback de versión:** `git checkout vX.Y.Z` para volver a un punto exacto en el tiempo.

---

## 10) GUÍA PARA DESARROLLADORES FUTUROS

### Reglas de Oro:
1. **No Romper App.tsx:** Cualquier cambio en el esquema de la base de datos debe ser reflejado en `types.ts` y en el helper de migración de `App.tsx`.
2. **Componentes Puros:** En lo posible, mantén los componentes de UI en `/components` sin lógica de guardado directo; prefiere pasar funciones de "update" desde el padre.
3. **Estilos Inline de Tailwind:** Se usa Tailwind masivamente. Mantenlo así para evitar dependencias de archivos `.css` externos pesados. 
4. **Iconos:** Usa siempre `lucide-react`.

---

## 11) TROUBLESHOOTING

- **Error de Lectura/Escritura:** Suele ocurrir por falta de permisos. Haz clic en el círculo rojo de estatus arriba a la derecha y usa el botón **Change DB** para volver a seleccionar el archivo.
- **El Expediente no abre:** Verifica en la consola (F12) si hay un error de migración de datos. Es posible que un campo nuevo sea nulo en una DB antigua.
- **Scroll Infinito / Blanco:** Si al abrir el expediente ves mucho espacio blanco, revisa que la altura del contenedor principal de la App coincida con el viewport (`h-screen`).

---

## 12) APÉNDICE (GLOSARIO)

- **OP:** Opportunity ID (Identificador único).
- **QLK:** Quotelink (Número de cotización oficial en sistemas externos).
- **SR:** Support Request (ID de soporte técnico asociado).
- **REV:** Revision (Versión de la propuesta técnica, ej. R0, R1).
- **BA / Basket:** Se refiere al carrito o lista de materiales (BOM).
- **GEET:** Enlace a la herramienta de estimación de entrega.
- **KPI:** Key Performance Indicators (Métricas de calidad y tiempos).
- **BFO:** Salesforce / Sistema comercial de referencia.

---

## 13) TENDER FLOW V3.1 (Estrategia Ejecutiva)

**Tender Flow** es el motor de decisiones estratégicas integrado. Mientras que TenderLoop gestiona la operación diaria, Tender Flow permite a los directores y líderes técnicos visualizar la macro-estrategia y tomar decisiones rápidas.

### Innovaciones de Fluidez (V15.3):
- **Arquitectura Memoizada**: Uso intensivo de `MemoizedBackboneItem` para asegurar que el UI no sufra lags, incluso con cientos de puntos de decisión.
- **Aceleración por Hardware**: Implementación de `will-change: transform` y curvas de suavizado `cubic-bezier` para una navegación sedosa.
- **Context-Aware Board**: El tablero de respuesta se ajusta dinámicamente al tipo de pregunta (Link, Decisión, Texto), eliminando ruido visual.

---

## 14) GUÍA PARA CONTRIBUIDORES

Si deseas realizar cambios o mejoras en la aplicación, sigue estas directrices para mantener la integridad del sistema:

1.  **Check de Fluidez**: Antes de commitear un nuevo componente en el Dashboard, asegúrate de que esté envuelto en `React.memo` si va a renderizarse repetidamente.
2.  **Sincronización**: La comunicación entre TenderLoop y Tender Flow se basa en el `syncId`. No alteres esta propiedad sin actualizar el motor de mapeo.
3.  **Estética Premium**: Se requiere el uso de gradientes sutiles, desenfoques de fondo (Glassmorphism) y animaciones de entrada suaves para mantener el estándar ejecutivo.

---

## 15) CRÉDITOS E INGENIERÍA
Desarrollado con un enfoque en **Performance-First Design**. 

© 2026 TenderLoop Team. Todos los derechos reservados.
