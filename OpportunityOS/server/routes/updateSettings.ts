import { Router } from 'express';
import path from 'node:path';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { DATA_DIR } from '../config';

export const updateSettingsRouter = Router();
const SETTINGS_FILE = path.join(DATA_DIR, 'update-settings.json');

const readSettings = async (): Promise<{ folderPath: string }> => {
    try {
        const value = JSON.parse(await readFile(SETTINGS_FILE, 'utf8'));
        return { folderPath: typeof value?.folderPath === 'string' ? value.folderPath : '' };
    } catch {
        return { folderPath: '' };
    }
};

updateSettingsRouter.get('/', async (_req, res) => res.json(await readSettings()));

updateSettingsRouter.put('/', async (req, res) => {
    const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath.trim() : '';
    if (folderPath) {
        if (!path.isAbsolute(folderPath)) return res.status(400).json({ error: 'Select an absolute Windows folder path.' });
        try {
            if (!(await stat(folderPath)).isDirectory()) return res.status(400).json({ error: 'The selected path is not a folder.' });
        } catch {
            return res.status(400).json({ error: 'The selected update folder could not be found.' });
        }
    }

    await mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${SETTINGS_FILE}.tmp`;
    await writeFile(temporaryFile, JSON.stringify({ folderPath }, null, 2), 'utf8');
    await rename(temporaryFile, SETTINGS_FILE);
    res.json({ folderPath });
});
