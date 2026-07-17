# Manual de Git y GitHub - TenderLoop

Este documento resume los comandos esenciales para tu flujo de trabajo diario, release y recuperación ante desastres.

## 🟢 Flujo Diario

### 1. Empezar una nueva tarea
Nunca trabajes directo en `main`. Crea una rama con el prefijo correcto:
- `reparacion/` (bugs)
- `nueva-funcionalidad/` (features)
- `cambio-funcionalidad/` (ajustes)

```bash
git checkout main
git pull origin main
git checkout -b nueva-funcionalidad/nombre-tarea
```

### 2. Guardar progreso
```bash
git add .
git commit -m "feat: descripción clara de lo que hiciste"
```

### 3. Subir cambios y verificar
```bash
git push -u origin nombre-de-tu-rama
```
> Ve a GitHub, crea el Pull Request (PR) y espera a que el check ✅ "CI Build" se ponga verde. Si está rojo ❌, revisa el error, arréglalo en local y vuelve a hacer push.

### 4. Integrar a main
Una vez que el PR está verde:
1. Dale "Merge" en GitHub.
2. En tu terminal local, actualiza main:
```bash
git checkout main
git pull origin main
git branch -d nombre-de-tu-rama  # Limpieza
```

---

## 🚀 Crear una Versión (Release)

Solo cuando tengas un conjunto de cambios listos para "producción":

1. Modifica `CHANGELOG.md`: Mueve lo de `[Unreleased]` a una nueva sección `## vX.Y.Z - FECHA`.
2. Commit y tag:
```bash
git add CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

---

## 🆘 Protocolo de Emergencia (Rollback)

### Caso A: Algo se rompió mientras trabajabas en tu rama
Simplemente descarta los cambios locales (¡Cuidado, esto borra trabajo no guardado!):
```bash
git checkout .
```

### Caso B: Funcionalidad rota en `main` (Necesito volver al pasado)
Si la versión actual `main` está rota, puedes volver a la última versión estable (ej. v1.0.0).

1. **Listar versiones:**
   ```bash
   git tag
   ```
2. **"Viajar en el tiempo" (Modo solo lectura):**
   ```bash
   git checkout v1.0.0
   ```
   *Ahora tu carpeta tiene los archivos exactos de ese momento. Puedes correr la app así.*

3. **Crear una rama de reparación desde el pasado:**
   Si necesitas arreglar algo basándote en esa versión vieja:
   ```bash
   git checkout -b reparacion/hotfix-desde-v1.0.0
   ```

4. **Volver al presente:**
   ```bash
   git checkout main
   ```

### Caso C: Deshacer el último merge en `main` (Reset duro)
Si acabas de hacer merge y todo explotó, y eres el único trabajando:
```bash
git checkout main
git reset --hard HEAD~1
git push origin main --force
```
> ⚠️ **PELIGRO:** Esto borra el historial del último commit en GitHub. Úsalo solo si estás seguro de que nadie más ha bajado cambios.
