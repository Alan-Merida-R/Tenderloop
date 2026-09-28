# Manual de instalación — Tender Control

Guía para ejecutar el proyecto en una PC nueva desde el ZIP.

---

## 1. Requisitos

- **Windows 10 / 11**
- **Navegador moderno:** Microsoft Edge o Google Chrome (se abren en modo *app*, sin pestañas). Cualquier versión reciente sirve.
- El ZIP oficial completo de Tender Control.

No instales Node.js ni ejecutes npm. El paquete lleva un runtime oficial firmado,
las dependencias exactas y la aplicación ya compilada. La instalación no descarga
nada, no modifica el Registro del sistema y no necesita permisos de administrador.

---

## 2. Descomprimir el ZIP

1. Guarda el ZIP en una ruta **sin tildes ni espacios raros**, por ejemplo:
   - ✅ `C:\Tenderloop\`
   - ✅ `D:\Proyectos\Tenderloop\`
   - ❌ `C:\Usuarios\María José\Escritorio\Tenderloop (copia)\`
2. Clic derecho → **Extraer todo…**
3. Al terminar, dentro de la carpeta deberás ver archivos como:
   - `INSTALAR_OPPORTUNITYOS.vbs` (primera instalación)
   - `OPEN_OPPORTUNITYOS.vbs` (inicio normal después de instalar)
   - `OPEN_OPPORTUNITYOS.bat` (alternativa si Windows bloquea VBS)
   - `engine_opportunityos.bat` (motor local; no es necesario abrirlo directamente)
   - `package.json`
   - etc.

> **No** muevas los archivos sueltos a otra carpeta: todo debe quedar junto.

---

## 3. Primera ejecución

Doble clic sobre:

```
INSTALAR_OPPORTUNITYOS.vbs
```

Lo que verás:

1. Se comprueba por SHA-256 que el runtime, el código y las dependencias empaquetadas no estén alterados.
2. Se confirma que la aplicación está completa y limitada a `127.0.0.1`.
3. Se crean los accesos directos; pulsa **Open app** para abrir Tender Control.
4. Tender Control mantiene un motor local mientras la aplicación está en uso.
   Para cerrarlo de forma segura utiliza `CLOSE_OPPORTUNITYOS.bat`.

La instalación no accede a Internet. Los puertos 3000 y 3099 son conexiones
internas de la misma computadora y no quedan expuestos a la red de la oficina.

> **Si aparece "SmartScreen" de Windows** al hacer doble clic:
> Haz clic en **Más información** → **Ejecutar de todas formas**. El script es tuyo, no hay riesgo.

---

## 4. Configurar la base de datos (para que se guarden tus proyectos)

Tender Control no usa una base de datos en la nube. Tus proyectos
(oportunidades, notas, tareas, KPIs y tiempos) viven en un archivo local que tú
eliges dónde guardar. El servicio local solo facilita operaciones con esos
archivos en tu propio equipo.

### 4.1 Crear una base de datos nueva (primera vez en la vida)

1. Al abrir la app verás una pantalla con dos botones grandes: **Create DB** y **Open DB**.
2. Haz clic en **Create DB**.
3. El navegador abrirá el explorador de archivos preguntando **dónde guardar** y **qué nombre** darle.
   - **Ubicación recomendada:** una carpeta tuya, por ejemplo:
     ```
     C:\Users\TuUsuario\Documents\TenderLoop\
     ```
     o en OneDrive / Google Drive / Dropbox para respaldo automático.
   - **Nombre sugerido:** `tenderloop-db.json` (o el nombre del equipo / año, ej. `tenderloop-2026.json`).
4. Pulsa **Guardar**. El navegador pedirá **permiso para escribir en ese archivo** → acepta ("Permitir" o "Guardar cambios").
5. Ya estás dentro de la app con una base vacía. A partir de aquí **cada cambio se guarda automáticamente** en ese `.json` (autoguardado cada 3 segundos, o inmediato al cerrar notas / expedientes).

### 4.2 Abrir una base de datos existente (ya tenías una)

Si recibiste un `.json` de otra persona, o traes el tuyo de otra PC:

1. En la pantalla inicial, haz clic en **Open DB**.
2. Navega hasta el `.json` y ábrelo.
3. El navegador te pedirá permiso una vez — acepta **"Permitir guardar cambios"**.

### 4.3 Del segundo arranque en adelante

Tender Control recuerda el último archivo que abriste y vuelve a conectarse
automáticamente. Solo puede pasar que el navegador pida confirmar el permiso
otra vez (acepta y listo).

### 4.4 Tener varias bases (proyectos distintos, año nuevo, etc.)

Puedes tener tantos archivos `.json` como quieras. Para cambiar entre ellos:

- Botón **"Cambiar DB"** dentro de la app (arriba a la derecha, menú de configuración), o
- Cerrar la app y abrirla con otro `.json` vía **Open DB**.

### 4.5 Respaldo

**Tu base = ese único archivo `.json`.** Ahí viven tus oportunidades, notas,
tareas, KPIs y tiempos, y también tus **notas adhesivas** y tus **accesos
rápidos** — antes se guardaban solo en el navegador y se perdían al limpiar la
caché o al cambiar de equipo. Si ya tenías notas adhesivas, la aplicación las
importa sola la primera vez que abres esta versión.

Cópialo a:
- OneDrive / Google Drive (respaldo automático la mejor opción)
- USB o disco externo de vez en cuando
- Correo a ti mismo si es pequeño

> ⚠️ **No confundas `db.json` con `package.json`:** el segundo es del proyecto (configuración del código) y no contiene tus datos. Solo `db.json` (o el nombre que le hayas dado al crearla) tiene tus oportunidades.

---

## 5. Ejecuciones siguientes

Simplemente haz doble clic en `OPEN_OPPORTUNITYOS.vbs`. Si falta la instalación,
abrirá el instalador automáticamente. Si Windows bloquea archivos VBS, usa
`OPEN_OPPORTUNITYOS.bat`.
Como todos los archivos ya vienen preparados, **el navegador abre en pocos segundos** y la ventana del motor queda oculta (minimizada en segundo plano).

> **Si Tender Control ya está abierto**, volver a hacer doble clic **no** abre una
> segunda ventana: trae al frente la que ya tienes (o la minimiza si ya estaba
> al frente). Puedes usarlo como un interruptor de mostrar/ocultar.

---

## 6. Cerrar la aplicación

Dos opciones:

- **Cierre limpio (recomendado):** doble clic en `CLOSE_OPPORTUNITYOS.bat`.
  Libera el puerto 3000 y detiene el servicio local del puerto 3099.
- **Cierre rápido:** cierra la ventana negra del motor. El navegador mostrará "no se puede conectar" a los pocos segundos — es normal, ya se apagó.

No hace falta cerrar el navegador manualmente; la app guarda antes de soltar el control.

---

## 7. (Opcional) TenderFlow

Es la aplicación gemela para la **matriz estratégica**. Se arranca por separado:

- Ejecutar: `TenderFlow\\LANZAR_TENDERFLOW.vbs` (puerto 3003).
- Alternativa para desarrollo: abre una terminal en `TenderFlow` y ejecuta
  `npm ci`, después `npm run dev`.

Puedes tener Loop y Flow abiertos al mismo tiempo — cada uno usa su propio puerto y no se estorban.

---

## 8. Desinstalar Tender Control

Si intentas borrar la carpeta de Tender Control directamente desde el Explorador de Windows, probablemente te aparezca el error:

> *"No se puede completar la acción porque el archivo está abierto en Node.js"*
> *"La acción no se puede completar porque otro proceso está usando el archivo"*

Eso pasa porque el motor de Vite / el helper de Node todavía están corriendo en segundo plano y tienen locks sobre archivos dentro de `node_modules`. Windows no te deja borrar una carpeta con archivos en uso.

**Para desinstalar correctamente:**

1. Doble clic en `DESINSTALAR_OPPORTUNITYOS.vbs` o usa **Uninstall Tender Control** desde el menú Inicio.
2. Confirma en la ventana visual.
3. El desinstalador hará estas tareas:
   - Cerrar los procesos locales de Tender Control en los puertos 3000 y 3099.
   - Verificar que esos procesos pertenecen a **esta** carpeta, sin cerrar aplicaciones ajenas.
   - Quitar los accesos directos.
4. Pulsa **Remove folder now** y espera el mensaje final que confirma la eliminación.

**¿Qué NO borra el desinstalador?**

- Tu base de datos (`.json`) → vive fuera de esta carpeta en la ruta que tú elegiste. **Queda intacta.**
- `%APPDATA%\OpportunityOS` → configuraciones y datos auxiliares permanecen intactos.
- Cualquier Node.js instalado por otras aplicaciones → no se toca.

> Si guardaste manualmente una base de datos dentro de la carpeta de instalación,
> muévela fuera antes de confirmar **Remove folder now**.

---

## 9. Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `The packaged Tender Control runtime is missing` | ZIP incompleto o se copiaron archivos sueltos | Extrae nuevamente el ZIP oficial completo |
| `failed its SHA-256 integrity check` | Archivo incompleto o alterado | Descarta esa copia y extrae nuevamente el ZIP oficial |
| El navegador abre pero se queda en blanco | El motor local aún está iniciando | Espera unos segundos y recarga (F5) |
| `Puerto 3000 en uso` | Otra app ocupa el puerto | Usa `CLOSE_OPPORTUNITYOS.bat` y vuelve a lanzar |
| La app dice "No se pudo guardar el archivo" | El navegador perdió permisos sobre el `.json` | Recarga (F5) y vuelve a abrir la base; aprueba el permiso que pide el navegador |
| Quiero reinstalar todo desde cero | Paquete incompleto o corrupto | Conserva tu base `.json`, extrae un ZIP oficial nuevo y ejecuta el instalador |
| Al vincular una carpeta pide la ruta a mano | Windows Search todavía no indexó la carpeta | Espera unos segundos y reintenta; la app ahora reintenta sola durante ~9 segundos antes de pedírtela |
| "El perfil de navegador de Tender Control ya está abierto" | Quedó una ventana de automatización abierta | Ciérrala y vuelve a intentar; Windows solo permite un proceso por perfil |
| Una lista de tareas o una nota "desapareció" | Está marcada como oculta | En Ajustes desmarca *Hide this list*, o abre la tira de **notas ocultas** en el expediente. Nada se borró |

---

## 10. Respaldar tu trabajo

**Tu base de datos es el archivo `.json` que elegiste al crearla.** Ni la carpeta del proyecto ni `node_modules` contienen tus datos — todo está en ese JSON.

- Cópialo periódicamente a un disco externo o nube.
- Si cambias de PC, basta con descomprimir el ZIP de nuevo, instalar Node, ejecutar el `.vbs` y abrir el mismo JSON desde **Open DB**.

---

## 11. Actualizaciones opcionales desde SharePoint

1. Sincroniza en Windows la carpeta de actualizaciones indicada por el responsable.
2. Abre **Settings > General > Application updates**.
3. Pulsa **Choose folder...**, selecciona la carpeta y pulsa **Save folder**.
4. Al iniciar, Tender Control comprobara e instalara una version mas reciente antes de abrir.

Esta configuracion es opcional. Sin carpeta, con SharePoint desconectado o con un
paquete invalido, Tender Control abre la version instalada y sigue funcionando.
Para desactivar las actualizaciones pulsa **Clear** y despues **Save folder**.
Los mensajes del actualizador aparecen en ingles. La version instalada se muestra
en **Settings > General > Application**.
