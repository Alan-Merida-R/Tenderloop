import json
import sys

file_path = r'c:\Users\Alan Merida\Documents\GitHub\Tenderloop\.ai\state\tasks.json'
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        tasks = json.load(f)

    # Check if TASK-061 exists
    exists = any(t['id'] == 'TASK-061' for t in tasks)
    if not exists:
        tasks.append({
            "id": "TASK-061",
            "name": "Alarmas configurables en Settings",
            "category": "Configuración/BD",
            "description": "Permitir configurar alarmas (color y días) en SettingsModal, y aplicarlas dinámicamente en getBadgeInfo dentro de Dashboard.",
            "status": "ready",
            "priority": "alta",
            "files_allowed": ["types.ts", "components/SettingsModal.tsx", "components/Dashboard.tsx"]
        })
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(tasks, f, indent=2, ensure_ascii=False)
        print("TASK-061 created.")
    else:
        print("TASK-061 already exists.")
except Exception as e:
    print("Error:", e)
