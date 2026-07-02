import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';

/**
 * Realtime layer (replaces Supabase Realtime). Clients join per-consultation and
 * per-user rooms; services emit events into those rooms so chat, status changes,
 * notifications, appointments and follow-ups propagate in real time.
 */
let io: SocketServer | null = null;

type CorsOrigin =
  | string
  | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);

export function initRealtime(server: HttpServer, origin: CorsOrigin): SocketServer {
  io = new SocketServer(server, {
    cors: { origin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('join:consultation', (consultationId: string) => {
      if (consultationId) socket.join(`consultation:${consultationId}`);
    });
    socket.on('leave:consultation', (consultationId: string) => {
      if (consultationId) socket.leave(`consultation:${consultationId}`);
    });
    socket.on('join:user', (userId: string) => {
      if (userId) socket.join(`user:${userId}`);
    });
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Realtime not initialised.');
  return io;
}

/** Emit to everyone watching a consultation (chat thread, status tracker). */
export function emitToConsultation(consultationId: string, event: string, payload: unknown): void {
  io?.to(`consultation:${consultationId}`).emit(event, payload);
}

/** Emit to a specific user (notifications, follow-up replies). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}
