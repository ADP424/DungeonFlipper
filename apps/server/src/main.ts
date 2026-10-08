import { resolve } from 'node:path';
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), 'data', 'dungeon.db');

const { app } = buildApp(dbPath);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`DungeonFlipper server on http://localhost:${port} (db: ${dbPath})`);
});
