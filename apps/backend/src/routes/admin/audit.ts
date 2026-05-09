import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, desc, and, ilike, or, gte, lte } from 'drizzle-orm';
import { authenticate, authorize } from '../../middleware/auth';

export async function auditRoutes(fastify: FastifyInstance) {
  // Apply auth and admin-only middleware
  fastify.addHook('preHandler', authenticate);
  const adminOnly = { preHandler: [authorize('ADMIN_KECAMATAN')] };

  /**
   * GET /v1/admin/audit-logs
   * Retrieve system activity logs with pagination and filters
   */
  fastify.get('/audit-logs', adminOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { 
        page?: string; 
        limit?: string; 
        search?: string; 
        action_type?: string; 
        start_date?: string;
        end_date?: string;
      };
      
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;

      const conditions: any[] = [];
      
      if (query.search) {
        conditions.push(or(
          ilike(schema.activityLogs.actionType, `%${query.search}%`),
          ilike(schema.activityLogs.entityType, `%${query.search}%`)
        ));
      }

      if (query.action_type) {
        conditions.push(eq(schema.activityLogs.actionType, query.action_type));
      }

      if (query.start_date && query.end_date) {
        conditions.push(and(
          gte(schema.activityLogs.createdAt, new Date(query.start_date)),
          lte(schema.activityLogs.createdAt, new Date(query.end_date))
        ));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Fetch logs with user relation
      const [logs, total] = await Promise.all([
        db.query.activityLogs.findMany({
          where: whereClause,
          offset: skip,
          limit,
          orderBy: [desc(schema.activityLogs.createdAt)],
          with: {
            user: {
              columns: {
                id: true,
                fullName: true,
                role: true,
              }
            },
            officer: {
              columns: {
                id: true,
                fullName: true,
              }
            }
          }
        }),
        db.$count(schema.activityLogs, whereClause)
      ]);

      return reply.send({
        success: true,
        data: {
          logs,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil log audit' }
      });
    }
  });
}

export default auditRoutes;
