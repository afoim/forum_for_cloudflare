import { SignJWT, jwtVerify } from 'jose';

const NONCE_TTL = 300; // 5 minutes in seconds
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface UserPayload {
    id: number;
    role: string;
    email: string;
    // Add other fields as needed
}

export class Security {
    private env: any;
    private secret: Uint8Array;

    constructor(env: any) {
        this.env = env;
        const secretStr = String(env.JWT_SECRET || '');
        if (!secretStr || secretStr.length < 32) {
            throw new Error('JWT_SECRET is not configured (must be at least 32 characters)');
        }
        this.secret = new TextEncoder().encode(secretStr);
    }

    // 1. Generate JWT Token
    async generateToken(user: UserPayload, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS): Promise<{ token: string; jti: string; expiresAt: number }> {
        const normalizedTtlSeconds = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : DEFAULT_SESSION_TTL_SECONDS;
        const jti = crypto.randomUUID();
        const expiresAt = Math.floor(Date.now() / 1000) + normalizedTtlSeconds;
        const token = await new SignJWT({ ...user })
            .setProtectedHeader({ alg: 'HS256' })
            .setJti(jti)
            .setIssuedAt()
            .setExpirationTime(expiresAt)
            .sign(this.secret);
        return { token, jti, expiresAt };
    }

    // 2. Verify JWT Token and return payload
    async verifyToken(token: string): Promise<UserPayload | null> {
        try {
            const { payload } = await jwtVerify(token, this.secret);
            const id = (payload as any)?.id;
            const role = (payload as any)?.role;
            const email = (payload as any)?.email;
            const jti = (payload as any)?.jti;
            if (typeof id !== 'number' || !Number.isFinite(id)) return null;
            if (typeof role !== 'string' || !role) return null;
            if (typeof email !== 'string' || !email) return null;
            if (typeof jti !== 'string' || !jti) return null;

            const session = await this.env.forum_db
                .prepare('SELECT user_id, expires_at FROM sessions WHERE jti = ?')
                .bind(jti)
                .first();
            if (!session) return null;
            if (Number(session.user_id) !== id) return null;
            if (Number(session.expires_at) <= Math.floor(Date.now() / 1000)) return null;

            if (Math.random() < 0.01) {
                await this.env.forum_db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run();
            }

            return { id, role, email };
        } catch (e) {
            return null;
        }
    }

    // 3. Replay Protection (Nonce + Timestamp)
    async validateRequest(request: Request): Promise<{ valid: boolean; error?: string }> {
        const timestamp = request.headers.get('X-Timestamp');
        const nonce = request.headers.get('X-Nonce');

        if (!timestamp || !nonce) {
            // Allow GET requests without nonce for public data? 
            // Requirement says "All sensitive operations", implying GET might be exempt or strictly checked.
            // Let's enforce for mutation methods (POST, PUT, DELETE)
            if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
                 return { valid: false, error: 'Missing security headers' };
            }
            return { valid: true };
        }

        const now = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);

        // Check timestamp validity (within 5 minutes)
        if (Math.abs(now - ts) > NONCE_TTL) {
            return { valid: false, error: 'Request expired' };
        }

        // Check if nonce exists
        const existing = await this.env.forum_db.prepare('SELECT nonce FROM nonces WHERE nonce = ?').bind(nonce).first();
        if (existing) {
            return { valid: false, error: 'Replay detected' };
        }

        // Store nonce (Async, but we should await to ensure safety or use batch)
        // We also need to clean up old nonces. For now, just insert.
        // In a real worker, we might use `ctx.waitUntil` for cleanup or a cron trigger.
        // Here we just insert with expiry.
        await this.env.forum_db.prepare('INSERT INTO nonces (nonce, expires_at) VALUES (?, ?)').bind(nonce, ts + NONCE_TTL).run();
        
        // Lazy cleanup: 1 in 100 requests cleans up old nonces
        if (Math.random() < 0.01) {
             await this.env.forum_db.prepare('DELETE FROM nonces WHERE expires_at < ?').bind(now).run();
        }

        return { valid: true };
    }

    // 4. Audit Logging
    async logAudit(userId: number | null, action: string, resourceType: string, resourceId: string, details: any, request: Request) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        await this.env.forum_db.prepare(
            'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(userId, action, resourceType, resourceId, JSON.stringify(details), ip).run();
    }
}
