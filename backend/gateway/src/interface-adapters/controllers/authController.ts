import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';

const { Pool } = pg;

// ── Schemas ──────────────────────────────────────────────────────────────────
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Constants ─────────────────────────────────────────────────────────────────
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

// ── Helpers ───────────────────────────────────────────────────────────────────
function issueTokens(app: FastifyInstance, userId: string, role: string) {
  const accessToken = app.jwt.sign({ userId, role }, { expiresIn: ACCESS_TOKEN_TTL });
  const rawRefresh = crypto.randomBytes(32).toString('hex');
  return { accessToken, rawRefresh };
}

function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/auth',
  });
}

async function saveRefreshToken(
  pool: InstanceType<typeof Pool>,
  userId: string,
  rawRefresh: string,
  expiresAt: Date,
) {
  const hash = await bcrypt.hash(rawRefresh, SALT_ROUNDS);
  await pool.query(
    `UPDATE users SET refresh_token_hash = $1, refresh_expires_at = $2 WHERE id = $3`,
    [hash, expiresAt, userId],
  );
}

// ── Route Registration ────────────────────────────────────────────────────────
export function registerAuthRoutes(app: FastifyInstance, pool: InstanceType<typeof Pool>): void {

  // POST /auth/signup — create a new manual user
  app.post('/auth/signup', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const { email, password, name } = parsed.data;

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [email, password_hash, name],
    );
    const userId = result.rows[0].id;

    // New signup → default role 'viewer'; insert only if not already present
    await pool.query(
      `INSERT INTO user_roles (user_id, role_name) VALUES ($1, 'viewer') ON CONFLICT DO NOTHING`,
      [userId],
    );

    const { accessToken, rawRefresh } = issueTokens(app, userId, 'viewer');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await saveRefreshToken(pool, userId, rawRefresh, expiresAt);
    setRefreshCookie(reply, rawRefresh, expiresAt);

    return reply.status(201).send({ accessToken });
  });

  // POST /auth/login — email + password
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const result = await pool.query<{ id: string; password_hash: string | null }>(
      `SELECT id, password_hash FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || !user.password_hash) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Resolve role from user_roles (first match wins)
    const roleRow = await pool.query<{ role_name: string }>(
      `SELECT role_name FROM user_roles WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const role = roleRow.rows[0]?.role_name ?? 'viewer';

    const { accessToken, rawRefresh } = issueTokens(app, user.id, role);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    // ponytail: overwrites existing session, logging out any previous device.
    await saveRefreshToken(pool, user.id, rawRefresh, expiresAt);
    setRefreshCookie(reply, rawRefresh, expiresAt);

    return reply.send({ accessToken });
  });

  // GET /auth/google — redirect to Google consent screen
  app.get('/auth/google', async (_req: FastifyRequest, reply: FastifyReply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    // ponytail: stub — fill in real credentials to enable Google OAuth.
    if (!clientId || clientId === 'your_google_client_id') {
      return reply.status(501).send({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri!,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GET /auth/google/callback — exchange code for tokens
  app.get('/auth/google/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { code } = req.query as { code?: string };
    if (!code) return reply.status(400).send({ error: 'Missing code parameter' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || clientId === 'your_google_client_id') {
      return reply.status(501).send({ error: 'Google OAuth not configured.' });
    }

    // Exchange code → access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return reply.status(502).send({ error: 'Google token exchange failed' });

    const tokenData = await tokenRes.json() as { access_token: string };

    // Fetch user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileRes.ok) return reply.status(502).send({ error: 'Google profile fetch failed' });

    const profile = await profileRes.json() as { sub: string; email: string; name: string };

    // Upsert user
    const upsert = await pool.query<{ id: string }>(
      `INSERT INTO users (email, google_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET google_id = EXCLUDED.google_id, name = EXCLUDED.name
       RETURNING id`,
      [profile.email, profile.sub, profile.name],
    );
    const userId = upsert.rows[0].id;

    await pool.query(
      `INSERT INTO user_roles (user_id, role_name) VALUES ($1, 'viewer') ON CONFLICT DO NOTHING`,
      [userId],
    );

    const roleRow = await pool.query<{ role_name: string }>(
      `SELECT role_name FROM user_roles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const role = roleRow.rows[0]?.role_name ?? 'viewer';

    const { accessToken, rawRefresh } = issueTokens(app, userId, role);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await saveRefreshToken(pool, userId, rawRefresh, expiresAt);
    setRefreshCookie(reply, rawRefresh, expiresAt);

    // Redirect to frontend dashboard with access token as query param
    return reply.redirect(`http://localhost:3001/dashboard?token=${accessToken}`);
  });

  // POST /auth/refresh — exchange HttpOnly cookie for new access token
  app.post('/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawRefresh = (req.cookies as Record<string, string | undefined>)['refresh_token'];
    if (!rawRefresh) return reply.status(401).send({ error: 'No refresh token' });

    const result = await pool.query<{
      id: string;
      refresh_token_hash: string | null;
      refresh_expires_at: Date | null;
    }>(
      `SELECT id, refresh_token_hash, refresh_expires_at FROM users WHERE refresh_token_hash IS NOT NULL`,
    );

    // Find matching user by comparing hash (ponytail: O(n) scan; ceiling ~1000 users before indexed lookup needed)
    let matchedUser: { id: string; refresh_expires_at: Date | null } | null = null;
    for (const row of result.rows) {
      if (row.refresh_token_hash && await bcrypt.compare(rawRefresh, row.refresh_token_hash)) {
        matchedUser = row;
        break;
      }
    }

    if (!matchedUser) return reply.status(401).send({ error: 'Invalid refresh token' });
    if (!matchedUser.refresh_expires_at || matchedUser.refresh_expires_at < new Date()) {
      return reply.status(401).send({ error: 'Refresh token expired' });
    }

    const roleRow = await pool.query<{ role_name: string }>(
      `SELECT role_name FROM user_roles WHERE user_id = $1 LIMIT 1`,
      [matchedUser.id],
    );
    const role = roleRow.rows[0]?.role_name ?? 'viewer';

    const accessToken = app.jwt.sign({ userId: matchedUser.id, role }, { expiresIn: ACCESS_TOKEN_TTL });
    return reply.send({ accessToken });
  });

  // POST /auth/logout — invalidate refresh token
  app.post('/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawRefresh = (req.cookies as Record<string, string | undefined>)['refresh_token'];
    if (rawRefresh) {
      // Best-effort: NULL out the token for whichever user owns this cookie
      const result = await pool.query<{ id: string; refresh_token_hash: string | null }>(
        `SELECT id, refresh_token_hash FROM users WHERE refresh_token_hash IS NOT NULL`,
      );
      for (const row of result.rows) {
        if (row.refresh_token_hash && await bcrypt.compare(rawRefresh, row.refresh_token_hash)) {
          await pool.query(`UPDATE users SET refresh_token_hash = NULL, refresh_expires_at = NULL WHERE id = $1`, [row.id]);
          break;
        }
      }
    }
    reply.clearCookie('refresh_token', { path: '/auth' });
    return reply.send({ ok: true });
  });
}
