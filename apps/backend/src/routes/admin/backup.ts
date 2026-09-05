import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync, unlinkSync, openSync, closeSync } from 'fs';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';

const FLAG_PATH = process.env.BACKUP_FLAG_PATH || '/app/backup-active';

export async function backupRoutes(fastify: FastifyInstance) {
  const adminOnly = authorize('ADMIN_KECAMATAN', 'ADMIN_RANTING');

  // GET /admin/backup/status — cek apakah flag backup aktif
  fastify.get('/backup/status', { preHandler: [adminOnly] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const active = existsSync(FLAG_PATH);
      return sendSuccess(reply, { active });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /admin/backup/start — aktifkan backup (buat flag file)
  // Flag dibuat atomik O_CREAT|O_EXCL ('wx'): tidak ada jendela TOCTOU
  // antara existsSync dan tulis (CodeQL js/file-system-race #5).
  fastify.post('/backup/start', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      try {
        closeSync(openSync(FLAG_PATH, 'wx'));
      } catch (error: any) {
        if (error?.code === 'EEXIST') {
          return sendSuccess(reply, { message: 'Backup sudah aktif', active: true });
        }
        throw error;
      }
      request.auditContext = {
        oldData: null,
        newData: { action: 'backup_started' },
      };
      fastify.log.info('Backup flag activated');

      return sendSuccess(reply, { message: 'Backup diaktifkan', active: true });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /admin/backup/stop — nonaktifkan backup (hapus flag file)
  fastify.post('/backup/stop', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!existsSync(FLAG_PATH)) {
        return sendSuccess(reply, { message: 'Backup sudah nonaktif', active: false });
      }

      unlinkSync(FLAG_PATH);
      request.auditContext = {
        oldData: null,
        newData: { action: 'backup_stopped' },
      };
      fastify.log.info('Backup flag deactivated');

      return sendSuccess(reply, { message: 'Backup dinonaktifkan', active: false });
    } catch (error) {
      return sendError(reply, 500, 'BACKUP_ERROR', 'Gagal menonaktifkan backup');
    }
  });
}
