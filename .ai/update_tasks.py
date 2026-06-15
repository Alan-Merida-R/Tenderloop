import json
import sys

file_path = r'c:\Users\Alan Merida\Documents\GitHub\Tenderloop\.ai\state\tasks.json'
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        tasks = json.load(f)

    for task in tasks:
        if task['id'] in [
            'TASK-011', 'TASK-012', 'TASK-013', 'TASK-014', 'TASK-015',
            'TASK-016', 'TASK-017', 'TASK-018', 'TASK-019', 'TASK-020', 'TASK-021'
        ]:
            task['status'] = 'done'
            task['implemented_at'] = '2026-06-15'
            task['implemented_by'] = 'subagent-vista-general'

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, indent=2, ensure_ascii=False)
    print("Tasks updated successfully.")
except Exception as e:
    print("Error:", e)
