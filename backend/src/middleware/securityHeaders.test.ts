import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import {
  buildCSPHeader,
  getSecurityHeaders,
  applySecurityHeaders,
  securityHeadersMiddleware,
  apiSecurityHeadersMiddleware,
  CSP_DIRECTIVES,
} from './securityHeaders';

describe('buildCSPHeader', () => {
  it('should build CSP header from default directives', () => {
    const csp = buildCSPHeader();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  it('should join directives with semicolons', () => {
    const csp = buildCSPHeader(["default-src 'self'", "script-src 'self'"]);

    expect(csp).toBe("default-src 'self'; script-src 'self'");
  });

  it('should use custom directives when provided', () => {
    const customDirectives = ["default-src 'none'", "img-src https:"];
    const csp = buildCSPHeader(customDirectives);

    expect(csp).toBe("default-src 'none'; img-src https:");
  });
});

describe('CSP_DIRECTIVES', () => {
  it('should include script-src self (P20.1)', () => {
    expect(CSP_DIRECTIVES).toContain("script-src 'self'");
  });

  it('should include style-src self (P20.2)', () => {
    expect(CSP_DIRECTIVES).toContain("style-src 'self'");
  });

  it('should include connect-src self (P20.3)', () => {
    expect(CSP_DIRECTIVES).toContain("connect-src 'self'");
  });

  it('should include require-trusted-types-for script (P20.4)', () => {
    expect(CSP_DIRECTIVES).toContain("require-trusted-types-for 'script'");
  });

  it('should include frame-ancestors none (P20.5)', () => {
    expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
  });

  it('should include trusted-types default', () => {
    expect(CSP_DIRECTIVES).toContain('trusted-types default');
  });

  it('should include upgrade-insecure-requests', () => {
    expect(CSP_DIRECTIVES).toContain('upgrade-insecure-requests');
  });
});

describe('getSecurityHeaders', () => {
  it('should return all security headers by default', () => {
    const headers = getSecurityHeaders();

    expect(headers['Content-Security-Policy']).toBeDefined();
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toBe('geolocation=(), microphone=(), camera=()');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('should allow disabling individual headers', () => {
    const headers = getSecurityHeaders({
      enableCSP: false,
      enableFrameOptions: false,
    });

    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(headers['X-Frame-Options']).toBeUndefined();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should allow custom CSP directives', () => {
    const headers = getSecurityHeaders({
      cspDirectives: ["default-src 'none'"],
    });

    expect(headers['Content-Security-Policy']).toBe("default-src 'none'");
  });
});

describe('applySecurityHeaders', () => {
  it('should apply all headers to context', () => {
    const appliedHeaders: Record<string, string> = {};
    const mockContext = {
      header: vi.fn((name: string, value: string) => {
        appliedHeaders[name] = value;
      }),
    } as any;

    const headers = {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    };

    applySecurityHeaders(mockContext, headers);

    expect(appliedHeaders['X-Frame-Options']).toBe('DENY');
    expect(appliedHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(mockContext.header).toHaveBeenCalledTimes(2);
  });
});

describe('securityHeadersMiddleware', () => {
  it('should apply security headers to all responses', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware());
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe('geolocation=(), microphone=(), camera=()');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('should apply headers after handler executes', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware());
    app.get('/test', (c) => {
      // Handler should execute before headers are applied
      return c.json({ success: true });
    });

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('should use custom config when provided', async () => {
    const app = new Hono();
    app.use(
      '*',
      securityHeadersMiddleware({
        enableCSP: false,
        enableHSTS: false,
      })
    );
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test');

    expect(res.headers.get('Content-Security-Policy')).toBeNull();
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('should apply headers to error responses', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware());
    app.get('/error', (c) => c.json({ error: 'Not Found' }, 404));

    const res = await app.request('/error');

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

describe('apiSecurityHeadersMiddleware', () => {
  it('should use relaxed CSP for API responses', async () => {
    const app = new Hono();
    app.use('*', apiSecurityHeadersMiddleware());
    app.get('/api/test', (c) => c.json({ data: 'test' }));

    const res = await app.request('/api/test');

    expect(res.status).toBe(200);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src");
  });

  it('should still include other security headers', async () => {
    const app = new Hono();
    app.use('*', apiSecurityHeadersMiddleware());
    app.get('/api/test', (c) => c.json({ data: 'test' }));

    const res = await app.request('/api/test');

    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
