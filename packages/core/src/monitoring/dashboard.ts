import { randomBytes } from 'node:crypto';
import * as http from 'node:http';
import type { ResolvedDashboardConfig } from '../config';
import { DashboardAuth } from './dashboard-auth';
import { getFlowPage, getLoginPage } from './dashboard-page';
import { Monitor } from './monitor';
import type { DashboardAddress } from './types';

const SESSION_COOKIE = 'hivelet_session';

export class Dashboard {
  private server?: http.Server;
  private address?: DashboardAddress;
  private readonly auth: DashboardAuth;
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly monitor: Monitor,
    private readonly config: ResolvedDashboardConfig,
    private readonly onPasswordGenerated: (password: string) => void = () => undefined
  ) {
    this.auth = new DashboardAuth(config.authFile, config.sessionTtl);
  }

  async start(): Promise<DashboardAddress> {
    if (this.address) return this.address;
    if (this.server) throw new Error('Dashboard is already starting');

    await this.auth.initialize(this.onPasswordGenerated);
    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch(() => {
        if (!response.headersSent) this.send(response, 500, 'text/plain; charset=utf-8', 'Internal Server Error', false);
        else response.destroy();
      });
    });
    this.server = server;

    try {
      const port = await new Promise<number>((resolve, reject) => {
        const handleError = (error: Error) => {
          server.off('listening', handleListening);
          reject(error);
        };
        const handleListening = () => {
          server.off('error', handleError);
          const value = server.address();
          resolve(typeof value === 'object' && value ? value.port : this.config.port);
        };
        server.once('error', handleError);
        server.once('listening', handleListening);
        server.listen(this.config.port, this.config.host);
      });
      const host = this.config.host.includes(':') ? `[${this.config.host}]` : this.config.host;
      this.address = Object.freeze({ host: this.config.host, port, url: `http://${host}:${port}` });
      return this.address;
    } catch (error) {
      this.server = undefined;
      throw error;
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.address = undefined;
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://hivelet.local').pathname;
    } catch {
      this.send(response, 400, 'text/plain; charset=utf-8', 'Bad Request', method === 'HEAD');
      return;
    }

    if (pathname === '/health' && (method === 'GET' || method === 'HEAD')) {
      this.json(response, 200, { status: 'ok', timestamp: new Date().toISOString() }, method === 'HEAD');
      return;
    }
    if (pathname === '/api/login' && method === 'POST') {
      await this.login(request, response);
      return;
    }
    if (pathname === '/api/logout' && method === 'POST') {
      const token = this.sessionFrom(request);
      this.auth.revokeSession(token);
      this.json(response, 200, { status: 'signed-out' }, false, { 'Set-Cookie': this.expiredCookie() });
      return;
    }

    const authenticated = this.auth.hasSession(this.sessionFrom(request));
    if (pathname === '/api/state' && (method === 'GET' || method === 'HEAD')) {
      if (!authenticated) {
        this.json(response, 401, { error: 'Unauthorized' }, method === 'HEAD');
        return;
      }
      this.json(response, 200, this.monitor.snapshot(), method === 'HEAD');
      return;
    }
    if (pathname === '/' && (method === 'GET' || method === 'HEAD')) {
      const nonce = randomBytes(18).toString('base64');
      this.send(response, 200, 'text/html; charset=utf-8', authenticated
        ? getFlowPage(nonce, this.config.refreshInterval)
        : getLoginPage(nonce), method === 'HEAD', {
          'Content-Security-Policy': `default-src 'none'; connect-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
        });
      return;
    }
    if (!['GET', 'HEAD', 'POST'].includes(method)) {
      this.send(response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed', false, { Allow: 'GET, HEAD, POST' });
      return;
    }
    this.send(response, 404, 'text/plain; charset=utf-8', 'Not Found', method === 'HEAD');
  }

  private async login(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const address = request.socket.remoteAddress ?? 'unknown';
    if (this.isRateLimited(address)) {
      this.json(response, 429, { error: 'Too many attempts' }, false, { 'Retry-After': '60' });
      return;
    }

    let password: unknown;
    try {
      const body = await this.readBody(request);
      password = (JSON.parse(body) as { password?: unknown }).password;
    } catch {
      this.json(response, 400, { error: 'Invalid request' }, false);
      return;
    }
    if (typeof password !== 'string' || !this.auth.verifyPassword(password)) {
      this.recordAttempt(address);
      this.json(response, 401, { error: 'Invalid password' }, false);
      return;
    }

    this.attempts.delete(address);
    const token = this.auth.createSession();
    this.json(response, 200, { status: 'authenticated' }, false, {
      'Set-Cookie': `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(this.config.sessionTtl / 1000)}`
    });
  }

  private readBody(request: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', chunk => {
        size += chunk.length;
        if (size > 4096) {
          reject(new Error('Request body is too large'));
          request.destroy();
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });
  }

  private sessionFrom(request: http.IncomingMessage): string | undefined {
    const cookies = request.headers.cookie?.split(';') ?? [];
    return cookies.map(value => value.trim().split('=')).find(([name]) => name === SESSION_COOKIE)?.[1];
  }

  private isRateLimited(address: string): boolean {
    const cutoff = Date.now() - 60_000;
    const attempts = (this.attempts.get(address) ?? []).filter(time => time > cutoff);
    this.attempts.set(address, attempts);
    return attempts.length >= 5;
  }

  private recordAttempt(address: string): void {
    this.attempts.set(address, [...(this.attempts.get(address) ?? []), Date.now()]);
  }

  private expiredCookie(): string {
    return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  }

  private json(
    response: http.ServerResponse,
    status: number,
    value: unknown,
    headOnly: boolean,
    headers: Record<string, string> = {}
  ): void {
    this.send(response, status, 'application/json; charset=utf-8', JSON.stringify(value), headOnly, headers);
  }

  private send(
    response: http.ServerResponse,
    status: number,
    contentType: string,
    body: string,
    headOnly: boolean,
    headers: Record<string, string> = {}
  ): void {
    response.writeHead(status, {
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      ...headers
    });
    response.end(headOnly ? undefined : body);
  }
}
