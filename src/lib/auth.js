import crypto from 'node:crypto';

// Identity is issued by the main SCIS Connect project; this service only
// verifies the bearer token it is handed. Swapping to RS256 or to a session
// lookup means changing verifyJwt alone -- callers just use getIdentity.

const decodeSegment = (segment) => Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const verifyJwt = (token, secret) => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  try {
    header = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  } catch {
    return null;
  }

  // Refusing anything but HS256 closes the "alg": "none" forgery.
  if (header.alg !== 'HS256') return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = decodeSegment(encodedSignature);

  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;

  let payload;
  try {
    payload = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) return null;
  if (typeof payload.nbf === 'number' && now < payload.nbf) return null;

  const issuer = process.env.AUTH_JWT_ISSUER;
  if (issuer && payload.iss !== issuer) return null;

  return payload;
};

const adminIds = () =>
  (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const toIdentity = (payload) => {
  const userId = String(payload.sub ?? payload.userId ?? payload.id ?? '').trim();
  if (!userId) return null;

  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  return {
    userId,
    name: String(payload.name ?? payload.username ?? payload.email ?? userId).trim(),
    isAdmin: roles.includes('admin') || adminIds().includes(userId),
  };
};

// Reads identity out of the standard header set. `headers` is anything with a
// case-insensitive get(), so both Next's Request and a Socket.IO handshake work.
export const identityFromHeaders = (headers) => {
  const get = (key) => headers.get?.(key) ?? headers[key] ?? headers[key.toLowerCase()] ?? null;

  const authorization = get('authorization');
  const secret = process.env.AUTH_JWT_SECRET;

  if (authorization?.startsWith('Bearer ') && secret) {
    const payload = verifyJwt(authorization.slice(7).trim(), secret);
    if (payload) return toIdentity(payload);
    return null;
  }

  // Standalone/testing path only. With the auth project wired in, set
  // ALLOW_DEV_AUTH=false and this branch disappears.
  if (process.env.ALLOW_DEV_AUTH === 'true') {
    const devId = get('x-dev-user-id');
    if (devId) {
      const id = String(devId).trim();
      return {
        userId: id,
        name: String(get('x-dev-user-name') ?? id).trim(),
        isAdmin: adminIds().includes(id),
      };
    }
  }

  return null;
};

export const getIdentity = (request) => identityFromHeaders(request.headers);

export const requireIdentity = (request) => {
  const identity = getIdentity(request);
  if (!identity) {
    const error = new Error('Sign in to continue.');
    error.status = 401;
    throw error;
  }
  return identity;
};

export const requireAdmin = (request) => {
  const identity = requireIdentity(request);
  if (!identity.isAdmin) {
    const error = new Error('Admins only.');
    error.status = 403;
    throw error;
  }
  return identity;
};
