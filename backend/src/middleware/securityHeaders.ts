import { Context, Next } from 'hono';

/**
 * Content Security Policy directives
 *
 * Correctness Properties:
 * - P20.1: script-src 'self' (no inline scripts)
 * - P20.2: style-src 'self' (Tailwind 4 no unsafe-inline needed)
 * - P20.3: connect-src 'self' (API calls only to own domain)
 * - P20.4: require-trusted-types-for 'script' (prevent DOM XSS)
 * - P20.5: frame-ancestors 'none' (prevent clickjacking)
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
  "require-trusted-types-for 'script'",
  'trusted-types default',
];

/**
 * Build CSP header string from directives
 */
export function buildCSPHeader(directives: string[] = CSP_DIRECTIVES): string {
  return directives.join('; ');
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  /** Enable Content-Security-Policy header */
  enableCSP?: boolean;
  /** Custom CSP directives (overrides defaults) */
  cspDirectives?: string[];
  /** Enable X-Frame-Options header */
  enableFrameOptions?: boolean;
  /** Enable X-Content-Type-Options header */
  enableContentTypeOptions?: boolean;
  /** Enable X-XSS-Protection header */
  enableXSSProtection?: boolean;
  /** Enable Referrer-Policy header */
  enableReferrerPolicy?: boolean;
  /** Enable Permissions-Policy header */
  enablePermissionsPolicy?: boolean;
  /** Enable Strict-Transport-Security header */
  enableHSTS?: boolean;
}

const DEFAULT_CONFIG: SecurityHeadersConfig = {
  enableCSP: true,
  enableFrameOptions: true,
  enableContentTypeOptions: true,
  enableXSSProtection: true,
  enableReferrerPolicy: true,
  enablePermissionsPolicy: true,
  enableHSTS: true,
};

/**
 * Get all security headers based on configuration
 */
export function getSecurityHeaders(
  config: SecurityHeadersConfig = DEFAULT_CONFIG
): Record<string, string> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const headers: Record<string, string> = {};

  if (mergedConfig.enableCSP) {
    headers['Content-Security-Policy'] = buildCSPHeader(mergedConfig.cspDirectives);
  }

  if (mergedConfig.enableFrameOptions) {
    // X-Frame-Options: DENY prevents clickjacking
    headers['X-Frame-Options'] = 'DENY';
  }

  if (mergedConfig.enableContentTypeOptions) {
    // X-Content-Type-Options: nosniff prevents MIME type sniffing
    headers['X-Content-Type-Options'] = 'nosniff';
  }

  if (mergedConfig.enableXSSProtection) {
    // X-XSS-Protection: legacy header, still useful for older browsers
    headers['X-XSS-Protection'] = '1; mode=block';
  }

  if (mergedConfig.enableReferrerPolicy) {
    // Referrer-Policy: controls referrer information sent with requests
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  }

  if (mergedConfig.enablePermissionsPolicy) {
    // Permissions-Policy: restricts browser features
    headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';
  }

  if (mergedConfig.enableHSTS) {
    // Strict-Transport-Security: enforce HTTPS
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  return headers;
}

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(c: Context, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    c.header(name, value);
  }
}

/**
 * Security headers middleware for Hono
 *
 * Applies comprehensive security headers to all responses:
 * - Content-Security-Policy with Trusted Types
 * - X-Frame-Options: DENY
 * - X-Content-Type-Options: nosniff
 * - X-XSS-Protection: 1; mode=block
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: restrict sensitive features
 * - Strict-Transport-Security: enforce HTTPS
 *
 * Usage:
 * ```ts
 * app.use('*', securityHeadersMiddleware());
 * ```
 */
export function securityHeadersMiddleware(config: SecurityHeadersConfig = {}) {
  const headers = getSecurityHeaders(config);

  return async (c: Context, next: Next) => {
    await next();
    applySecurityHeaders(c, headers);
  };
}

/**
 * Security headers middleware for API responses
 * Uses a more relaxed CSP suitable for JSON API responses
 */
export function apiSecurityHeadersMiddleware() {
  return securityHeadersMiddleware({
    enableCSP: true,
    cspDirectives: [
      "default-src 'none'",
      "frame-ancestors 'none'",
    ],
  });
}

// Export CSP directives for testing
export { CSP_DIRECTIVES };
