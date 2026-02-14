import * as http from 'http';
import { Monitor } from './monitor';

export class Dashboard {
  private server?: http.Server;
  private monitor: Monitor;
  private port: number;
  private host: string;

  constructor(monitor: Monitor, port: number = 0, host: string = 'localhost') {
    this.monitor = monitor;
    this.port = port;
    this.host = host;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', reject);
      
      this.server.listen(this.port, this.host, () => {
        const addr = this.server!.address();
        const actualPort = typeof addr === 'object' ? addr!.port : this.port;
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [SUCCESS] Dashboard started at http://${this.host}:${actualPort}`);
        resolve(actualPort);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';

    if (url === '/api/state') {
      this.sendJSON(res, {
        builds: this.monitor.getBuilds(),
        modules: this.monitor.getActiveModules(),
        stats: this.monitor.getStats()
      });
    } else {
      this.sendHTML(res);
    }
  }

  private sendJSON(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private sendHTML(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.getHTML());
  }

private getHTML(): string {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deploy4Me Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

    :root {
      --bg: #0a0a0a;
      --text: #f2f2f2;
      --text-dim: #666666;
      --border: #1a1a1a;
      --success: #4ade80;
      --error: #f87171;
      --process: #60a5fa;
      --accent: #ffffff;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 4rem 2rem;
      display: flex;
      justify-content: center;
      -webkit-font-smoothing: antialiased;
    }
    
    .container { width: 100%; max-width: 900px; }
    
    header {
      margin-bottom: 4rem;
      border-bottom: 1px solid var(--text);
      padding-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    h1 { font-size: 1.4rem; font-weight: 500; letter-spacing: -0.03em; text-transform: lowercase; }
    .subtitle { color: var(--text-dim); font-size: 0.8rem; }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 2rem;
      margin-bottom: 5rem;
    }
    
    .stat-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 0.5rem; }
    .stat-value { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
    
    .section { margin-bottom: 4rem; }
    
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
    }

    .section-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--text-dim);
    }

    /* Tabs Styling */
    .tabs { display: flex; gap: 1.5rem; }
    .tab {
      background: none;
      border: none;
      color: var(--text-dim);
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      cursor: pointer;
      padding: 0.5rem 0;
      transition: color 0.2s;
      position: relative;
    }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--accent); }
    .tab.active::after {
      content: '';
      position: absolute;
      bottom: -0.6rem;
      left: 0;
      width: 100%;
      height: 1px;
      background: var(--accent);
    }
    
    .list-item {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
      align-items: center;
    }

    .item-name { font-weight: 500; font-size: 1rem; }
    .item-details {
      font-size: 0.75rem;
      color: var(--text-dim);
      display: flex;
      gap: 1rem;
      font-family: 'ui-monospace', monospace;
    }
    
    .status-text { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; }
    .status-building { color: var(--process); }
    .status-success { color: var(--success); }
    .status-error { color: var(--error); }

    .error-log {
      grid-column: 1 / -1;
      font-family: 'ui-monospace', monospace;
      font-size: 0.7rem;
      color: var(--error);
      padding: 0.5rem 0;
      opacity: 0.8;
    }

    /* Pagination Styling */
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 2rem;
      margin-top: 2rem;
      font-size: 0.75rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .page-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.4rem 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .page-btn:disabled { color: var(--text-dim); cursor: not-allowed; border-color: transparent; }
    .page-btn:not(:disabled):hover { border-color: var(--text-dim); }

    .empty { color: var(--text-dim); padding: 2rem 0; font-style: italic; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>deploy4me.dashboard</h1>
      <div id="stat-uptime" class="subtitle">0s</div>
    </header>
    
    <div class="stats">
      <div class="stat-item"><div class="stat-label">builds</div><div class="stat-value" id="stat-total">0</div></div>
      <div class="stat-item"><div class="stat-label">success</div><div class="stat-value" id="stat-success">0</div></div>
      <div class="stat-item"><div class="stat-label">failed</div><div class="stat-value" id="stat-failed">0</div></div>
      <div class="stat-item"><div class="stat-label">active</div><div class="stat-value" id="stat-modules">0</div></div>
    </div>
    
    <div class="section">
      <div class="section-header"><div class="section-title">Active Modules</div></div>
      <div id="modules"><div class="empty">Inquiring...</div></div>
    </div>
    
    <div class="section">
      <div class="section-header">
        <div class="section-title">Build History</div>
        <div class="tabs">
          <button class="tab active" onclick="setFilter('all')">All</button>
          <button class="tab" onclick="setFilter('building')">Building</button>
          <button class="tab" onclick="setFilter('success')">Success</button>
          <button class="tab" onclick="setFilter('error')">Failed</button>
        </div>
      </div>
      <div id="builds"></div>
      <div class="pagination">
        <button id="prev-btn" class="page-btn" onclick="changePage(-1)">Previous</button>
        <span id="page-info">Page 1</span>
        <button id="next-btn" class="page-btn" onclick="changePage(1)">Next</button>
      </div>
    </div>
  </div>
  
  <script>
    let allBuilds = [];
    let currentFilter = 'all';
    let currentPage = 1;
    const itemsPerPage = 8;

    function formatUptime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return m > 0 ? \`up \${m}m \${s%60}s\` : \`up \${s}s\`;
    }
    
    function setFilter(filter) {
      currentFilter = filter;
      currentPage = 1;
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.textContent.toLowerCase() === filter || (filter === 'error' && t.textContent === 'Failed'));
      });
      render();
    }

    function changePage(step) {
      currentPage += step;
      render();
    }

    function render() {
      // Stats & Modules rendering
      // ... (handled in fetchData)
    }

    async function fetchData() {
      try {
        const res = await fetch('/api/state');
        const data = await res.json();
        
        // Update Stats
        document.getElementById('stat-total').textContent = data.stats.totalBuilds;
        document.getElementById('stat-success').textContent = data.stats.successfulBuilds;
        document.getElementById('stat-failed').textContent = data.stats.failedBuilds;
        document.getElementById('stat-modules').textContent = data.stats.activeModules;
        document.getElementById('stat-uptime').textContent = formatUptime(data.stats.uptime);

        // Update Modules
        const modContainer = document.getElementById('modules');
        modContainer.innerHTML = data.modules.map(mod => \`
          <div class="list-item">
            <div class="item-name">\${mod.name} <span style="color:var(--text-dim); font-size:0.7rem">v\${mod.version}</span></div>
            <div class="status-text status-active">active</div>
          </div>
        \`).join('') || '<div class="empty">No active modules.</div>';

        allBuilds = data.builds;
        renderBuilds();
      } catch (e) { console.error('Sync error'); }
    }

    function renderBuilds() {
      const container = document.getElementById('builds');
      
      // Filter
      const filtered = allBuilds.filter(b => currentFilter === 'all' || b.status === currentFilter);
      
      // Pagination
      const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
      if (currentPage > totalPages) currentPage = totalPages;
      
      const start = (currentPage - 1) * itemsPerPage;
      const paginated = filtered.slice(start, start + itemsPerPage);

      document.getElementById('page-info').textContent = \`Page \${currentPage} of \${totalPages}\`;
      document.getElementById('prev-btn').disabled = currentPage === 1;
      document.getElementById('next-btn').disabled = currentPage === totalPages;

      if (!paginated.length) {
        container.innerHTML = '<div class="empty">No records found for this filter.</div>';
        return;
      }

      container.innerHTML = paginated.map(build => \`
        <div class="list-item">
          <div>
            <div class="item-name">\${build.moduleName}</div>
            <div class="item-details">
              <span>\${new Date(build.startTime).toLocaleTimeString('tr-TR')}</span>
              <span>\${build.duration ? (build.duration/1000).toFixed(2)+'s' : '--'}</span>
            </div>
          </div>
          <div class="status-text status-\${build.status}">\${build.status}</div>
          \${build.error ? \`<div class="error-log">\${build.error}</div>\` : ''}
        </div>
      \`).join('');
    }
    
    fetchData();
    setInterval(fetchData, 3000);
  </script>
</body>
</html>`;
  }
}
