import pg from 'pg';

// Single shared pool — one connection pool per process is the stdlib answer.
// Config is read once at startup; no runtime reconfiguration needed.
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
