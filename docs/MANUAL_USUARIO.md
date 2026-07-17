# Manual de instalación — TenderLoop

Guía para ejecutar el proyecto en una PC nueva desde el ZIP.

---

## 1. Requisitos (una sola vez por PC)

- **Windows 10 / 11**
- **Node.js 18 o superior (LTS)** → https://nodejs.org/
- **Navegador moderno:** Microsoft Edge o Google Chrome (se abren en modo *app*, sin pestañas). Cualquier versión reciente sirve.
- **Conexión a internet** la **primera vez** que se arranca (para descargar las dependencias). Después ya no se necesita.

### 1.A Instalar Node.js SIN permisos de administrador

En computadoras del trabajo muchas veces el instalador `.msi` de Node pide contraseña de administrador. Puedes esquivarlo usando la **versión ZIP portátil** — se descomprime en tu carpeta de usuario y no toca el sistema.

**Paso a paso:**

1. Ve a https://nodejs.org/en/download
2. En **Prebuilt Binaries** selecciona:
   - **OS:** Windows
   - **Arquitectura:** x64
   - **Formato:** `.zip` *(no `.msi`)*
3. Descarga el archivo (ej. `node-v20.18.0-win-x64.zip`).
4. Descomprime en una ruta **dentro de tu carpeta de usuario**, por ejemplo:
   ```
   C:\Users\TuUsuario\node
   ```
   El contenido debe quedar así: `C:\Users\TuUsuario\node\node.exe`, `npm.cmd`, etc.
5. Añade esa ruta al PATH **del usuario** (no del sistema — no necesitas admin):
   - Pulsa la tecla **Windows**, escribe `variables de entorno` y elige **"Editar las variables de entorno para esta cuenta"** (la que dice **para esta cuenta**, NO la del sistema).
   - En el cuadro de arriba ("Variables de usuario"), selecciona **Path** → **Editar** → **Nuevo** → pega `C:\Users\TuUsuario\node` → **Aceptar** → **Aceptar**.
6. **Cierra todas las ventanas de `cmd` / PowerShell** que tuvieras abiertas (el PATH nuevo solo aplica a consolas nuevas).
7. Abre una consola nueva (`Windows + R` → escribe `cmd` → Enter) y verifica:
   ```
   node -v
   npm -v
   ```
   Debe responder `v20.xx.x` y un número para npm. Si sale "no se reconoce…", revisa que escribiste bien la ruta en Path.

> **¿Por qué funciona sin admin?**
> El ZIP portátil no registra nada en el Registro de Windows ni copia archivos a `C:\Program Files`. Vive dentro de tu carpeta personal, sobre la que sí tienes permisos.

> **¿IT bloquea la descarga?** Pide que abran https://nodejs.org y https://registry.npmjs.org en la lista blanca, o descarga el ZIP desde tu casa y tráelo en USB.

---

## 2. Descomprimir el ZIP

1. Guarda el ZIP en una ruta **sin tildes ni espacios raros**, por ejemplo:
   - ✅ `C:\Tenderloop\`
   - ✅ `D:\Proyectos\Tenderloop\`
   - ❌ `C:\Usuarios\María José\Escritorio\Tenderloop (copia)\`
2. Clic derecho → **Extraer todo…**
3. Al terminar, dentro de la carpeta deberás ver archivos como:
   - `ABRIR_TENDERLOOP.vbs` (inicio normal)
   - `LANZAR_TENDERFLOW.vbs`
   - `motor_tenderloop.bat`
   - `package.json`
   - etc.

> **No** muevas los archivos sueltos a otra carpeta: todo debe quedar junto.

---

## 3. Primera ejecución

Doble clic sobre:

```
ABRIR_TENDERLOOP.vbs
```

Lo que verás:

1. Se abre una ventana negra con el título **"Tender Loop - Motor (puerto 3000)"**.
2. El texto `[INFO] Instalando paquetes por primera vez, puede tardar varios minutos…` aparece y empieza a bajar dependencias (≈ 3-10 min según la red).
3. Cuando termina, sale `[OK] Servidor iniciando…` y **se abre el navegador** solo, en una ventana tipo "aplicación".
4. **Deja la ventana negra abierta** todo el tiempo que uses TenderLoop — es el servidor local. Si la cierras, la app deja de funcionar.

> **Si aparece "SmartScreen" de Windows** al hacer doble clic:
> Haz clic en **Más información** → **Ejecutar de todas formas**. El script es tuyo, no hay riesgo.

---

## 4. Configurar la base de datos (para que se guarden tus proyectos)

TenderLoop **no usa una base de datos en la nube ni un servidor**: tus proyectos (oportunidades, notas, tareas, KPIs, tiempos) viven en **un solo archivo `.json`** que tú eliges dónde guardar. Eso significa que cuando quieras cambiar de PC, respaldar o compartir el estado, **basta con copiar ese JSON**.

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

TenderLoop **recuerda el último archivo que abriste** y vuelve a conectarse automáticamente. Solo puede pasar que el navegador pida confirmar el permiso otra vez (acepta y listo).

### 4.4 Tener varias bases (proyectos distintos, año nuevo, etc.)

Puedes tener tantos archivos `.json` como quieras. Para cambiar entre ellos:

- Botón **"Cambiar DB"** dentro de la app (arriba a la derecha, menú de configuración), o
- Cerrar la app y abrirla con otro `.json` vía **Open DB**.

### 4.5 Respaldo

**Tu base = ese único archivo `.json`.** Cópialo a:
- OneDrive / Google Drive (respaldo automático la mejor opción)
- USB o disco externo de vez en cuando
- Correo a ti mismo si es pequeño

> ⚠️ **No confundas `db.json` con `package.json`:** el segundo es del proyecto (configuración del código) y no contiene tus datos. Solo `db.json` (o el nombre que le hayas dado al crearla) tiene tus oportunidades.

---

## 5. Ejecuciones siguientes

Simplemente doble clic en `ABRIR_TENDERLOOP.vbs`. Este es el único archivo que debes usar normalmente. Si falta la instalación, abrirá el instalador automáticamente. Los archivos internos del instalador y del lanzador quedan ocultos después del primer inicio. Si Windows bloquea el inicio normal, usa `motor_tenderloop.bat` como respaldo visible.
Como ya están instaladas las dependencias, **el navegador abre en pocos segundos** y la ventana del motor queda oculta (minimizada en segundo plano).

---

## 6. Cerrar la aplicación

Dos opciones:

- **Cierre limpio (recomendado):** doble clic en `CERRAR_TENDERLOOP.bat`. Libera el puerto 3000 y detiene el helper de archivos.
- **Cierre rápido:** cierra la ventana negra del motor. El navegador mostrará "no se puede conectar" a los pocos segundos — es normal, ya se apagó.

No hace falta cerrar el navegador manualmente; la app guarda antes de soltar el control.

---

## 7. (Opcional) Tender Flow

Es la aplicación gemela para la **matriz estratégica**. Se arranca por separado:

- Ejecutar: `LANZAR_TENDERFLOW.vbs` (puerto 3003)
- Cerrar: `CERRAR_TENDERFLOW.bat`

Puedes tener Loop y Flow abiertos al mismo tiempo — cada uno usa su propio puerto y no se estorban.

---

## 8. Desinstalar TenderLoop

Si intentas borrar la carpeta de TenderLoop directamente desde el Explorador de Windows, probablemente te aparezca el error:

> *"No se puede completar la acción porque el archivo está abierto en Node.js"*
> *"La acción no se puede completar porque otro proceso está usando el archivo"*

Eso pasa porque el motor de Vite / el helper de Node todavía están corriendo en segundo plano y tienen locks sobre archivos dentro de `node_modules`. Windows no te deja borrar una carpeta con archivos en uso.

**Para desinstalar correctamente:**

1. Doble clic en `DESINSTALAR_TENDERLOOP.vbs` o usa **Uninstall TenderLoop** desde el menú Inicio.
2. Confirma en la ventana visual.
3. El desinstalador hará cuatro cosas:
   - Cerrar los procesos locales de TenderLoop en los puertos 3000 y 3099.
   - Cerrar cualquier `node.exe` que esté ejecutándose desde **esta** carpeta (sin tocar otros Node que tengas para otras cosas).
   - Borrar `node_modules`, `dist` y `.vite` (lo más pesado y lo que bloquea la eliminación).
4. Cuando termine, ya puedes borrar la carpeta completa desde el Explorador sin errores.

**¿Qué NO borra el desinstalador?**

- Tu base de datos (`.json`) → vive fuera de esta carpeta en la ruta que tú elegiste. **Queda intacta.**
- Node.js instalado en tu PC → es para otros proyectos también. **No se toca.**
- Los archivos fuente del proyecto (`App.tsx`, `package.json`, etc.) → para que puedas reinstalar de nuevo si cambias de opinión (simplemente ejecuta `ABRIR_TENDERLOOP.vbs` otra vez y volverá a bajar `node_modules`).

> **¿Quieres borrar TODO incluido el código?** Ejecuta `DESINSTALAR_TENDERLOOP.vbs` primero (libera los locks) y luego borra la carpeta completa desde el Explorador.

> **¿El desinstalador dice "No se pudo borrar node_modules por completo"?** Significa que hay procesos de Node con locks que no se pudieron cerrar (a veces antivirus corporativo). Reinicia la PC y vuelve a ejecutar el desinstalador — al arrancar Windows "limpio" ya no habrá nada bloqueando.

---

## 9. Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `[ERROR] Node.js no esta instalado` | Node no está instalado o falta reiniciar | Instala Node LTS y reinicia la PC |
| `Fallo "npm install". Revisa tu conexion o proxy corporativo` | Red bloqueada o VPN corporativa | Ejecuta fuera de la VPN, o pide a IT abrir `registry.npmjs.org` |
| El navegador abre pero se queda en blanco | Vite aún no terminó de compilar | Espera 10-20 s y recarga (F5) |
| `Puerto 3000 en uso` | Otra app ocupa el puerto | Usa `CERRAR_TENDERLOOP.bat` y vuelve a lanzar |
| La app dice "No se pudo guardar el archivo" | El navegador perdió permisos sobre el `.json` | Recarga (F5) y vuelve a abrir la base; aprueba el permiso que pide el navegador |
| Quiero reinstalar todo desde cero | Dependencias corruptas | Borra la carpeta `node_modules` y vuelve a doble clic en el `.vbs` |

---

## 10. Respaldar tu trabajo

**Tu base de datos es el archivo `.json` que elegiste al crearla.** Ni la carpeta del proyecto ni `node_modules` contienen tus datos — todo está en ese JSON.

- Cópialo periódicamente a un disco externo o nube.
- Si cambias de PC, basta con descomprimir el ZIP de nuevo, instalar Node, ejecutar el `.vbs` y abrir el mismo JSON desde **Open DB**.
