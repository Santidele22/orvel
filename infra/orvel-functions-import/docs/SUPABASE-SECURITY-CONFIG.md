# Supabase Security Configuration Guide

This document provides the required configuration steps to fix HIGH priority security vulnerabilities (SEC-FIX-003-004).

**Project**: `[name].supabase.co`

---

## Issue #3: CORS Wildcard Configuration

### Current Vulnerability
The Supabase API currently allows all origins (`*`), which permits any website to make API requests to your backend.

### Required Fix: Restrict Allowed Origins

Navigate to: **Supabase Dashboard → Settings → API → API Settings**

#### Configuration Values

**Allowed Origins (CORS)**:
```
# Local Development
http://localhost:4321
http://localhost:3000
http://localhost:5173
http://localhost:5174

# Production - UPDATE THESE with your actual domains
https://your-production-domain.com
https://www.your-production-domain.com
```

#### Steps to Apply:
1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: `[name]`
3. Go to **Settings** (gear icon) → **API**
4. Under **API Settings**, find **Allowed Origins**
5. Remove `*` and add the specific domains listed above
6. Click **Save**

---

## Issue #4: Rate Limiting

### Current Vulnerability
APIs lack rate limiting protection, making them vulnerable to brute force and DoS attacks.

### Required Fix: Enable Rate Limiting

Navigate to: **Supabase Dashboard → Settings → API → Rate Limiting**

#### Configuration Values

| Endpoint Type | Requests/Minute | Burst | Description |
|--------------|-----------------|-------|-------------|
| **Auth** | 10 | 20 | Login, signup, password reset |
| **API (general)** | 60 | 100 | General database operations |
| **Login attempts** | 5 | 10 | Failed login detection |

#### Steps to Apply:
1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: `[name]`
3. Go to **Settings** → **API** → **Rate Limiting**
4. Enable rate limiting with the values above
5. Click **Save**

#### Alternative: Edge Functions Rate Limiting

If the built-in rate limiting is insufficient, you can implement custom rate limiting via Edge Functions:

```typescript
// supabase/functions/rate-limit/index.ts
const RATE_LIMIT = 60; // requests per minute
const WINDOW_MS = 60 * 1000;

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

Deno.serve(async (req) => {
  const clientId = req.headers.get('x-client-id') || req.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();

  let clientData = rateLimitStore.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    clientData = { count: 0, resetTime: now + WINDOW_MS };
    rateLimitStore.set(clientId, clientData);
  }

  clientData.count++;

  if (clientData.count > RATE_LIMIT) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ... rest of handler
});
```

---

## Documentation of Allowed Origins

### Current Configuration (TO BE UPDATED)
- ❌ `*` (ALL ORIGINS - VULNERABLE)

### Recommended Configuration (AFTER FIX)
```json
[
  "http://localhost:4321",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://your-production-domain.com",
  "https://www.your-production-domain.com"
]
```

---

## Verification Checklist

- [ ] CORS restricted to specific domains (not wildcard `*`)
- [ ] Rate limiting enabled on critical endpoints
- [ ] Allowed origins documented
- [ ] Production domains updated when available

---

## References

- [Supabase API Settings Documentation](https://supabase.com/docs/guides/api/api-settings)
- [Supabase Rate Limiting](https://supabase.com/docs/guides/api/rate-limits)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

*Document created: 2026-04-21*
*Task: SEC-FIX-003-004*
