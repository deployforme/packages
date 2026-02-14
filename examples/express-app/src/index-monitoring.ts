import express from 'express';
import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import * as path from 'path';

const app = express();
app.use(express.json());

// Create adapter and kernel with monitoring enabled
const adapter = new ExpressAdapter(app);
const context = createRuntimeContext(adapter);
const kernel = new Kernel(context, {
  liveRunnerActions: true,  // Dashboard'u aktif et
  port: 5000,               // Dashboard sabit port
  host: 'localhost'
});

// Load initial module
kernel.load(path.join(__dirname, 'modules', 'user.module.js'))
  .then(() => console.log('User module loaded'))
  .catch(console.error);

// Management endpoints
app.post('/admin/load', async (req, res) => {
  try {
    const { path: modulePath } = req.body;
    await kernel.load(modulePath);
    res.json({ success: true, message: `Module loaded from ${modulePath}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/reload/:module', async (req, res) => {
  try {
    const modulePath = path.join(__dirname, 'modules', `${req.params.module}.module.js`);
    await kernel.reload(modulePath);
    res.json({ success: true, message: `Module ${req.params.module} reloaded` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/admin/modules', (req, res) => {
  const modules = kernel.list().map(m => ({
    name: m.module.name,
    version: m.version,
    routes: m.registeredRoutes.length,
    loadedAt: m.loadedAt
  }));
  res.json(modules);
});

app.get('/admin/stats', (req, res) => {
  const monitor = kernel.getMonitor();
  res.json({
    stats: monitor.getStats(),
    builds: monitor.getBuilds(),
    modules: monitor.getActiveModules()
  });
});

app.listen(3001, () => {
  console.log('Express app running on http://localhost:3001');
  console.log('Admin: http://localhost:3001/admin/modules');
  console.log('Stats: http://localhost:3001/admin/stats');
});
