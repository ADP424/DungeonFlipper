import Fastify, { type FastifyInstance } from 'fastify';
import { applyCommand, emptyWorld, registerAllContent, type Command, type DocKey, type WorldState } from '@df/shared';
import { Store } from './db';

interface SyncBody {
  playerId: string;
  baseRevision: number;
  commands: Command[];
}

/**
 * HTTP API:
 *   GET  /api/state?playerId=…  → the player's world (404 if none yet)
 *   POST /api/sync              → apply a batch of commands with the shared reducer and persist
 *
 * The server re-runs the exact reducer the client used, so it stays authoritative-ready: adding
 * validation (or moving to websockets for multiplayer) happens here without changing the client model.
 */
export function buildApp(dbPath: string): { app: FastifyInstance; store: Store } {
  registerAllContent();
  const store = new Store(dbPath);
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
  /** Cached world states keyed by world id, so frequent syncs don't re-read every document. */
  const cache = new Map<string, WorldState>();

  const loadForOwner = (ownerId: string): WorldState | undefined => {
    const id = store.worldIdForOwner(ownerId);
    if (!id) return undefined;
    let w = cache.get(id);
    if (!w) {
      w = store.load(id);
      if (w) cache.set(id, w);
    }
    return w;
  };

  app.get('/api/health', async () => ({ ok: true }));

  app.get<{ Querystring: { playerId?: string } }>('/api/state', async (req, reply) => {
    const playerId = req.query.playerId;
    if (!playerId) return reply.code(400).send({ error: 'playerId required' });
    const w = loadForOwner(playerId);
    if (!w) return reply.code(404).send({ error: 'no world' });
    return { state: w };
  });

  app.post<{ Body: SyncBody }>('/api/sync', async (req, reply) => {
    const { playerId, baseRevision, commands } = req.body ?? ({} as SyncBody);
    if (!playerId || !Array.isArray(commands)) return reply.code(400).send({ error: 'bad request' });

    let w = loadForOwner(playerId);
    const isNew = !w;
    if (!w) {
      if (commands[0]?.type !== 'worldCreated') return reply.code(409).send({ error: 'unknown world', needsFullSync: true });
      w = emptyWorld();
    }
    // MVP: last writer wins. A mismatch means another device wrote in between; we still apply.
    const conflict = !isNew && baseRevision !== w.revision;

    const touched = new Set<DocKey>();
    const errors: string[] = [];
    for (const cmd of commands) {
      try {
        for (const k of applyCommand(w, cmd)) touched.add(k);
      } catch (e) {
        errors.push(`${cmd.type}: ${(e as Error).message}`);
      }
    }
    const revision = store.save(w, touched, JSON.stringify(commands));
    cache.set(w.worldId, w);
    return { revision, conflict, errors };
  });

  app.addHook('onClose', async () => store.close());
  return { app, store };
}
