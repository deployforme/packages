import express from 'express';
import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import * as path from 'path';

const app = express();
app.use(express.json());

// Create adapter and kernel
const adapter = new ExpressAdapter(app);
const context = createRuntimeContext(adapter);
const kernel = new Kernel(context);

// Load initial module from BUILT dist folder
const modulesPath = path.join(__dirname, 'modules');
kernel.load(path.join(modulesPath, 'user.module.js'))
  .then(() => console.log('✓ User module loaded from production build'))
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
    const modulePath = path.join(modulesPath, `${req.params.module}.module.js`);
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

app.listen(3000, () => {
  console.log('🚀 Express app running on http://localhost:3000 (PRODUCTION BUILD)');
  console.log('📊 Admin: http://localhost:3000/admin/modules');
  console.log('📁 Modules path:', modulesPath);
});
