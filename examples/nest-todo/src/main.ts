import 'reflect-metadata';
import { HiveletNestFactory } from '@hivelet/adapter-nest';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { TodoStore } from './todo.store';

void HiveletNestFactory.start(AppModule, {
  port: Number(process.env.PORT ?? 9100),
  modules: path.join(__dirname, 'modules'),
  inject: { todoStore: TodoStore },
  kernel: {
    dashboard: {
      enabled: true,
      port: Number(process.env.HIVELET_DASHBOARD_PORT ?? 9101),
      authFile: path.join(process.cwd(), '.hivelet', 'dashboard-auth.json')
    },
    autonomous: { autoRollback: true, debounce: 150 },
    versioning: { directory: path.join(process.cwd(), '.hivelet', 'versions') }
  }
}).catch(() => {
  process.exitCode = 1;
});
