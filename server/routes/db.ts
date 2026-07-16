import { Router } from 'express';
import type { Request, Response } from 'express';
import { dbRepository } from '../db/repository';

export const dbRouter = Router();

const sendSnapshot = (res: Response, statusCode = 200) => {
    const snapshot = dbRepository.current();
    if (!snapshot) return res.status(404).json({ error: 'No database is open.' });
    return res.status(statusCode).json({
        ok: true,
        data: snapshot.data,
        status: dbRepository.status(),
    });
};

const sendStatus = (res: Response, statusCode = 200) => {
    return res.status(statusCode).json({
        ok: true,
        status: dbRepository.status(),
    });
};

const handleError = (res: Response, err: any) => {
    const statusCode = Number(err?.statusCode) || 400;
    return res.status(statusCode).json({ error: err?.message || String(err) });
};

dbRouter.get('/status', (_req: Request, res: Response) => {
    res.json({ ok: true, status: dbRepository.status() });
});

dbRouter.get('/current', (_req: Request, res: Response) => {
    return sendSnapshot(res);
});

dbRouter.get('/default', async (_req: Request, res: Response) => {
    try {
        await dbRepository.openDefault();
        return sendSnapshot(res);
    } catch (err: any) {
        if (err?.code === 'ENOENT') return res.status(404).json({ error: 'Default backend database does not exist.' });
        return handleError(res, err);
    }
});

dbRouter.post('/default', async (req: Request, res: Response) => {
    try {
        await dbRepository.createDefault(Boolean(req.body?.overwrite));
        return sendSnapshot(res, 201);
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.post('/import', async (req: Request, res: Response) => {
    try {
        await dbRepository.importDefault(req.body?.data);
        return sendSnapshot(res, 201);
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.post('/open', async (req: Request, res: Response) => {
    try {
        await dbRepository.open(req.body?.path);
        return sendSnapshot(res);
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.post('/create', async (req: Request, res: Response) => {
    try {
        await dbRepository.create(req.body?.path, Boolean(req.body?.overwrite));
        return sendSnapshot(res, 201);
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.put('/current', async (req: Request, res: Response) => {
    try {
        const expectedRevision = req.body?.expectedRevision;
        await dbRepository.save(req.body?.data, typeof expectedRevision === 'number' ? expectedRevision : undefined);
        if (req.query.compact === '1') return sendStatus(res);
        return sendSnapshot(res);
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.post('/backup', async (_req: Request, res: Response) => {
    try {
        const backup = await dbRepository.backup();
        if (!backup) return res.status(404).json({ error: 'No database is open or source file is missing.' });
        return res.json({ ok: true, backup, status: dbRepository.status() });
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.post('/recovery-backup', async (req: Request, res: Response) => {
    try {
        const backup = await dbRepository.archiveSnapshot(req.body?.data, req.body?.name);
        return res.json({ ok: true, backup });
    } catch (err) {
        return handleError(res, err);
    }
});

dbRouter.post('/close', (_req: Request, res: Response) => {
    dbRepository.close();
    return res.json({ ok: true, status: dbRepository.status() });
});
