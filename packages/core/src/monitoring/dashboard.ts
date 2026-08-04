import { randomBytes } from 'node:crypto';
import * as http from 'node:http';
import type { ResolvedDashboardConfig } from '../config';
import { Monitor } from './monitor';
import type { DashboardAddress } from './types';

export class Dashboard {
  private server?: http.Server;
  private address?: DashboardAddress;

  constructor(
    private readonly monitor: Monitor,
    private readonly config: ResolvedDashboardConfig
  ) {}

  async start(): Promise<DashboardAddress> {
    if (this.address) {
      return this.address;
    }
    if (this.server) {
      throw new Error('Dashboard is already starting');
    }

    const server = http.createServer((request, response) => {
      this.handleRequest(request, response);
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
      this.address = Object.freeze({
        host: this.config.host,
        port,
        url: `http://${host}:${port}`
      });
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

    if (!server?.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private handleRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      this.send(response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed', method === 'HEAD', {
        Allow: 'GET, HEAD'
      });
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://hivelet.local').pathname;
    } catch {
      this.send(response, 400, 'text/plain; charset=utf-8', 'Bad Request', method === 'HEAD');
      return;
    }

    if (pathname === '/api/state') {
      this.send(
        response,
        200,
        'application/json; charset=utf-8',
        JSON.stringify(this.monitor.snapshot()),
        method === 'HEAD'
      );
      return;
    }

    if (pathname === '/health') {
      this.send(
        response,
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
        method === 'HEAD'
      );
      return;
    }

    if (pathname === '/') {
      const nonce = randomBytes(18).toString('base64');
      this.send(
        response,
        200,
        'text/html; charset=utf-8',
        this.getHTML(nonce),
        method === 'HEAD',
        {
          'Content-Security-Policy': `default-src 'none'; connect-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
        }
      );
      return;
    }

    this.send(response, 404, 'text/plain; charset=utf-8', 'Not Found', method === 'HEAD');
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

  private getHTML(nonce: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Hivelet Runtime</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: dark;
      --background: #080808;
      --surface: #101010;
      --surface-raised: #151515;
      --text: #f4f4f4;
      --muted: #8a8a8a;
      --faint: #555;
      --border: #2a2a2a;
      --success: #9ae6b4;
      --error: #feb2b2;
      --building: #90cdf4;
    }
    * { box-sizing: border-box; }
    html { background: var(--background); }
    body {
      margin: 0;
      min-width: 320px;
      background: var(--background);
      color: var(--text);
      font-family: Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    button { font: inherit; }
    .shell { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 36px 0 64px; }
    .masthead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 22px;
      border-bottom: 1px solid var(--text);
    }
    .brand { display: flex; align-items: baseline; gap: 12px; }
    .brand-name { font-size: 18px; font-weight: 700; letter-spacing: -0.04em; }
    .brand-label, .eyebrow, .section-label, .stat-label, .meta, .status, .filter, .page-button {
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .brand-label, .eyebrow, .section-label, .stat-label, .meta { color: var(--muted); }
    .connection { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; }
    .connection-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
    .connection[data-state="online"] .connection-dot { background: var(--success); }
    .connection[data-state="offline"] .connection-dot { background: var(--error); }
    .intro { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 48px; padding: 56px 0 48px; }
    .eyebrow { margin: 0 0 14px; }
    h1 { max-width: 720px; margin: 0; font-size: clamp(42px, 7vw, 86px); line-height: 0.93; letter-spacing: -0.065em; font-weight: 500; }
    .intro-copy { align-self: end; max-width: 390px; margin: 0; color: var(--muted); font-size: 15px; line-height: 1.55; }
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--border); border-left: 1px solid var(--border); }
    .stat { min-height: 126px; padding: 18px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--surface); }
    .stat-value { display: block; margin-top: 30px; font-size: 34px; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
    .panel { margin-top: 64px; }
    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
    .section-title { margin: 6px 0 0; font-size: 24px; line-height: 1; letter-spacing: -0.035em; font-weight: 500; }
    .filters { display: flex; flex-wrap: wrap; gap: 4px; }
    .filter, .page-button {
      min-height: 36px;
      border: 1px solid transparent;
      border-radius: 0;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
    }
    .filter { padding: 0 11px; }
    .filter:hover, .page-button:hover:not(:disabled) { color: var(--text); border-color: var(--border); }
    .filter[aria-pressed="true"] { background: var(--text); color: var(--background); }
    .filter:focus-visible, .page-button:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .list { min-height: 92px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px 28px; padding: 20px 2px; border-bottom: 1px solid var(--border); }
    .row-main { min-width: 0; }
    .row-title { overflow: hidden; color: var(--text); font-size: 16px; font-weight: 500; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
    .row-subtitle { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 7px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
    .row-subtitle span { overflow: hidden; max-width: min(620px, 70vw); text-overflow: ellipsis; white-space: nowrap; }
    .status { align-self: start; padding-top: 3px; font-weight: 700; }
    .status-active, .status-success { color: var(--success); }
    .status-error { color: var(--error); }
    .status-building { color: var(--building); }
    .error-message { grid-column: 1 / -1; margin: -4px 0 0; padding: 12px; border-left: 2px solid var(--error); background: var(--surface-raised); color: var(--error); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
    .empty { padding: 30px 2px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 14px; }
    .pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 18px; }
    .page-button { padding: 0 12px; border-color: var(--border); }
    .page-button:disabled { cursor: not-allowed; opacity: 0.35; }
    .footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 72px; padding-top: 16px; border-top: 1px solid var(--border); }
    @media (max-width: 800px) {
      .shell { width: min(100% - 32px, 1180px); padding-top: 24px; }
      .intro { grid-template-columns: 1fr; gap: 24px; padding-top: 44px; }
      .intro-copy { max-width: 560px; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .stat:last-child { grid-column: 1 / -1; }
      .section-head { align-items: start; flex-direction: column; }
    }
    @media (max-width: 520px) {
      .masthead, .footer { align-items: start; flex-direction: column; }
      .brand { align-items: start; flex-direction: column; gap: 4px; }
      h1 { font-size: 46px; }
      .stats { grid-template-columns: 1fr; }
      .stat:last-child { grid-column: auto; }
      .stat { min-height: 104px; }
      .stat-value { margin-top: 22px; }
      .row { grid-template-columns: minmax(0, 1fr); }
      .status { grid-row: 1; justify-self: end; }
      .row-main { grid-row: 1; }
      .filters { width: 100%; }
      .filter { flex: 1 1 auto; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div class="brand"><span class="brand-name">hivelet</span><span class="brand-label">runtime control</span></div>
      <div id="connection" class="connection" data-state="loading" role="status" aria-live="polite"><span class="connection-dot"></span><span id="connection-label">Connecting</span></div>
    </header>
    <section class="intro" aria-labelledby="page-title">
      <div><p class="eyebrow">Live system overview</p><h1 id="page-title">Modules in motion.</h1></div>
      <p class="intro-copy">A real-time view of active runtime modules, route ownership, and deployment history.</p>
    </section>
    <section class="stats" aria-label="Runtime statistics">
      <div class="stat"><span class="stat-label">Builds</span><strong id="stat-total" class="stat-value">0</strong></div>
      <div class="stat"><span class="stat-label">Successful</span><strong id="stat-success" class="stat-value">0</strong></div>
      <div class="stat"><span class="stat-label">Failed</span><strong id="stat-failed" class="stat-value">0</strong></div>
      <div class="stat"><span class="stat-label">Building now</span><strong id="stat-building" class="stat-value">0</strong></div>
      <div class="stat"><span class="stat-label">Active modules</span><strong id="stat-modules" class="stat-value">0</strong></div>
    </section>
    <section class="panel" aria-labelledby="modules-title">
      <div class="section-head"><div><span class="section-label">Registry</span><h2 id="modules-title" class="section-title">Active modules</h2></div><span id="uptime" class="meta">Uptime 0s</span></div>
      <div id="modules" class="list" aria-live="polite"><div class="empty">Loading modules</div></div>
    </section>
    <section class="panel" aria-labelledby="builds-title">
      <div class="section-head">
        <div><span class="section-label">Timeline</span><h2 id="builds-title" class="section-title">Build history</h2></div>
        <div class="filters" aria-label="Build status filter">
          <button class="filter" type="button" data-filter="all" aria-pressed="true">All</button>
          <button class="filter" type="button" data-filter="building" aria-pressed="false">Building</button>
          <button class="filter" type="button" data-filter="success" aria-pressed="false">Success</button>
          <button class="filter" type="button" data-filter="error" aria-pressed="false">Failed</button>
        </div>
      </div>
      <div id="builds" class="list" aria-live="polite"><div class="empty">Loading builds</div></div>
      <nav class="pagination" aria-label="Build history pages">
        <button id="previous" class="page-button" type="button">Previous</button>
        <span id="page" class="meta">Page 1 of 1</span>
        <button id="next" class="page-button" type="button">Next</button>
      </nav>
    </section>
    <footer class="footer"><span class="meta">Hivelet dashboard</span><span id="updated" class="meta">Waiting for data</span></footer>
  </main>
  <script nonce="${nonce}">
    const refreshInterval = ${this.config.refreshInterval};
    const itemsPerPage = 8;
    const state = { builds: [], filter: 'all', page: 1, timer: undefined };
    const element = id => document.getElementById(id);
    const create = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = String(text);
      return node;
    };
    const formatUptime = milliseconds => {
      const seconds = Math.floor(milliseconds / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return 'Uptime ' + days + 'd ' + hours + 'h';
      if (hours > 0) return 'Uptime ' + hours + 'h ' + minutes + 'm';
      if (minutes > 0) return 'Uptime ' + minutes + 'm ' + (seconds % 60) + 's';
      return 'Uptime ' + seconds + 's';
    };
    const formatDuration = milliseconds => {
      if (milliseconds === undefined) return 'In progress';
      if (milliseconds < 1000) return milliseconds + ' ms';
      return (milliseconds / 1000).toFixed(2) + ' s';
    };
    const formatTime = value => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
    const setConnection = (status, label) => {
      element('connection').dataset.state = status;
      element('connection-label').textContent = label;
    };
    const renderModules = modules => {
      const container = element('modules');
      container.replaceChildren();
      if (modules.length === 0) {
        container.append(create('div', 'empty', 'No active modules'));
        return;
      }
      modules.forEach(module => {
        const row = create('article', 'row');
        const main = create('div', 'row-main');
        main.append(create('div', 'row-title', module.name));
        const details = create('div', 'row-subtitle');
        details.append(create('span', '', 'v' + module.version));
        details.append(create('span', '', module.routeCount + (module.routeCount === 1 ? ' route' : ' routes')));
        details.append(create('span', '', 'Loaded ' + formatTime(module.loadedAt)));
        main.append(details);
        row.append(main, create('span', 'status status-' + module.status, module.status));
        container.append(row);
      });
    };
    const renderBuilds = () => {
      const filtered = state.builds.filter(build => state.filter === 'all' || build.status === state.filter);
      const pages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
      state.page = Math.min(state.page, pages);
      const visible = filtered.slice((state.page - 1) * itemsPerPage, state.page * itemsPerPage);
      const container = element('builds');
      container.replaceChildren();
      if (visible.length === 0) {
        container.append(create('div', 'empty', 'No builds match this filter'));
      } else {
        visible.forEach(build => {
          const row = create('article', 'row');
          const main = create('div', 'row-main');
          main.append(create('div', 'row-title', build.moduleName));
          const details = create('div', 'row-subtitle');
          details.append(create('span', '', formatTime(build.startTime)));
          details.append(create('span', '', formatDuration(build.duration)));
          details.append(create('span', '', build.modulePath));
          main.append(details);
          row.append(main, create('span', 'status status-' + build.status, build.status));
          if (build.error) row.append(create('p', 'error-message', build.error));
          container.append(row);
        });
      }
      element('page').textContent = 'Page ' + state.page + ' of ' + pages;
      element('previous').disabled = state.page === 1;
      element('next').disabled = state.page === pages;
    };
    const applySnapshot = snapshot => {
      element('stat-total').textContent = String(snapshot.stats.totalBuilds);
      element('stat-success').textContent = String(snapshot.stats.successfulBuilds);
      element('stat-failed').textContent = String(snapshot.stats.failedBuilds);
      element('stat-building').textContent = String(snapshot.stats.buildingNow);
      element('stat-modules').textContent = String(snapshot.stats.activeModules);
      element('uptime').textContent = formatUptime(snapshot.stats.uptime);
      element('updated').textContent = 'Updated ' + formatTime(snapshot.generatedAt);
      state.builds = snapshot.builds;
      renderModules(snapshot.modules);
      renderBuilds();
    };
    const sync = async () => {
      window.clearTimeout(state.timer);
      try {
        const response = await fetch('/api/state', { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Dashboard API returned ' + response.status);
        applySnapshot(await response.json());
        setConnection('online', 'Live');
      } catch {
        setConnection('offline', 'Connection lost');
      } finally {
        if (!document.hidden) state.timer = window.setTimeout(sync, refreshInterval);
      }
    };
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        state.page = 1;
        document.querySelectorAll('[data-filter]').forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate === button)));
        renderBuilds();
      });
    });
    element('previous').addEventListener('click', () => { state.page -= 1; renderBuilds(); });
    element('next').addEventListener('click', () => { state.page += 1; renderBuilds(); });
    document.addEventListener('visibilitychange', () => {
      window.clearTimeout(state.timer);
      if (!document.hidden) sync();
    });
    sync();
  </script>
</body>
</html>`;
  }
}
