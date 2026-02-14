import express from 'express';
import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import * as path from 'path';

const app = express();
app.use(express.json());

// Logging utilities
const timestamp = () => new Date().toISOString();
const log = {
  info: (msg: string) => console.log(`[${timestamp()}] [INFO]  ${msg}`),
  success: (msg: string) => console.log(`[${timestamp()}] [SUCCESS] ${msg}`),
  error: (msg: string) => console.log(`[${timestamp()}] [ERROR] ${msg}`),
  warn: (msg: string) => console.log(`[${timestamp()}] [WARN]  ${msg}`),
  debug: (msg: string) => console.log(`[${timestamp()}] [DEBUG] ${msg}`)
};

console.log('\n' + '='.repeat(80));
console.log('  Deploy4Me Runtime Module Management System - Zero Downtime Demo');
console.log('='.repeat(80) + '\n');

log.info('Initializing Deploy4Me kernel...');

// Create adapter and kernel with monitoring enabled
const adapter = new ExpressAdapter(app);
const context = createRuntimeContext(adapter);
const kernel = new Kernel(context, {
  liveRunnerActions: true,
  port: 5000,
  host: 'localhost'
});

log.success('Kernel initialized successfully');

// Load modules
async function loadModules() {
  log.info('Starting module loading sequence...');
  
  try {
    const modulesToLoad = [
      { name: 'user', path: path.join(__dirname, 'modules', 'user.module.js') },
      { name: 'product', path: path.join(__dirname, 'modules', 'product.module.js') }
    ];

    for (const module of modulesToLoad) {
      await kernel.load(module.path);
      log.success(`Module '${module.name}' loaded and registered`);
    }
    
    log.info(`Module loading completed. Total modules: ${kernel.list().length}`);
  } catch (error: any) {
    log.error(`Module loading failed: ${error.message}`);
    throw error;
  }
}

// Admin endpoints
app.post('/admin/reload/:module', async (req, res) => {
  const moduleName = req.params.module;
  const startTime = Date.now();
  
  try {
    const modulePath = path.join(__dirname, 'modules', `${moduleName}.module.js`);
    
    log.info(`Initiating reload for module '${moduleName}'`);
    
    await kernel.reload(modulePath);
    
    const duration = Date.now() - startTime;
    log.success(`Module '${moduleName}' reloaded successfully (${duration}ms)`);
    
    res.json({ 
      success: true, 
      message: `Module ${moduleName} reloaded`,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log.error(`Module '${moduleName}' reload failed after ${duration}ms: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/admin/modules', (_req, res) => {
  log.debug('Fetching module list');
  const modules = kernel.list().map(m => ({
    name: m.module.name,
    version: m.version,
    routes: m.registeredRoutes.length,
    loadedAt: m.loadedAt
  }));
  res.json(modules);
});

app.get('/admin/stats', (_req, res) => {
  log.debug('Fetching system statistics');
  const monitor = kernel.getMonitor();
  res.json({
    stats: monitor.getStats(),
    builds: monitor.getBuilds(),
    modules: monitor.getActiveModules()
  });
});

app.get('/health', (_req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    modules: kernel.list().length,
    timestamp: new Date().toISOString()
  });
});

// Start server
loadModules().then(() => {
  app.listen(3001, () => {
    console.log('\n' + '='.repeat(80));
    log.success('Demo server started successfully');
    console.log('='.repeat(80) + '\n');
    
    console.log('API Endpoints:');
    console.log('  • Users:    http://localhost:3001/users');
    console.log('  • Products: http://localhost:3001/products');
    console.log('  • Health:   http://localhost:3001/health\n');
    
    console.log('Admin Endpoints:');
    console.log('  • Modules:  GET  http://localhost:3001/admin/modules');
    console.log('  • Stats:    GET  http://localhost:3001/admin/stats');
    console.log('  • Reload:   POST http://localhost:3001/admin/reload/:module\n');
    
    console.log('Monitoring Dashboard:');
    console.log('  • URL:      http://localhost:5000\n');
    
    console.log('='.repeat(80));
    console.log('Demo Instructions:');
    console.log('='.repeat(80));
    console.log('1. Test endpoints continuously:');
    console.log('   while($true) { curl http://localhost:3001/users; Start-Sleep 1 }\n');
    console.log('2. Edit module file:');
    console.log('   src/modules/user.module.js (change version)\n');
    console.log('3. Build changes:');
    console.log('   npm run build\n');
    console.log('4. Reload module:');
    console.log('   curl -X POST http://localhost:3001/admin/reload/user\n');
    console.log('5. Observe: Product endpoint continues without interruption\n');
    console.log('='.repeat(80) + '\n');
    
    log.info('System ready for zero-downtime deployment demonstration');
  });
}).catch((error) => {
  log.error(`Server startup failed: ${error.message}`);
  process.exit(1);
});
