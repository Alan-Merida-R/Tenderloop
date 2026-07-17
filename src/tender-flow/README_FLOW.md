# Tender Executive Flow v2.2

Aplicación estratégica para la gestión de checklists y flujos de decisión en oportunidades de licitación (Tendering).

## 🚀 Inicio Rápido

1.  **Directorio:** La aplicación vive en `/tender-flow`.
2.  **Ejecución:** Corre en el puerto **3003**.
    ```bash
    npm run dev-flow
    ```
3.  **Convivencia con Loop:** La aplicación principal de Loop corre en el puerto **3000**. Ambas pueden ejecutarse simultáneamente sin conflicto.

## 💎 Características Principales

*   **Offline-First:** Almacenamiento local de casos y estándares.
*   **Motor Lógico:** Soporta dependencias complejas (AND/OR/NOT).
*   **Executive Dashboard:** Semáforos de estado por área y modo de reunión.
*   **Standard Editor:** Edita etapas, áreas y preguntas sin salir de la App.
*   **Dual View Map:** Visualiza el flujo como diagrama o como roadmap vertical.
*   **Sync to Loop:** Puente de datos con la base de datos maestra de Loop.

## 📊 Estructura del Excel Estándar

El archivo de importación debe tener 3 hojas obligatorias:

1.  **Questions:** ID, Stage, Area, ItemType, Priority, Content, Description, ResponseType, AllowedValues, DependencyRules, LogicOperator, Deliverables.
2.  **Stages:** name, order, active.
3.  **Areas:** name, order, active, color.

## 🛠️ Desarrollo Técnico

*   **Tecnología:** React + TypeScript + Vite.
*   **Estilo:** CSS Moderno (Vanilla) con estética ejecutiva oscura.
*   **Persistencia:** LocalStorage con migración automática de esquemas.

---
© 2026 Tender Executive Flow - Proprietary Technical Architecture.
