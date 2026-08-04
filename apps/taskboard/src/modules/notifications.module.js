'use strict';

let cleanup = null;

module.exports = {
  name: 'notifications',
  version: '1.0.0',

  register(context) {
    const taskStore = context.container.get('taskStore');
    const notifier = context.container.get('notifier');
    context.logger.log('[Hivelet] notifications module registering');

    const unsubscribers = [
      taskStore.subscribe(event => {
        if (event.type === 'task:created') {
          notifier.notify('task-created', { title: event.task.title });
        }
      }),
      taskStore.subscribe(event => {
        if (event.type === 'task:completed') {
          notifier.notify('task-completed', {
            title: event.task.title,
            detail: `tags=${event.task.tagIds.join(',') || 'none'}`
          });
        }
      }),
      taskStore.subscribe(event => {
        if (event.type === 'task:deleted') {
          notifier.notify('task-deleted', { title: event.taskId });
        }
      })
    ];

    context.http.registerRoute({
      id: 'notifications-history',
      method: 'GET',
      path: '/notifications',
      handler: async () => ({ count: notifier.history().length, items: notifier.history() })
    });

    cleanup = () => {
      for (const unsub of unsubscribers) unsub();
      console.log('[Hivelet] notifications module cleaned up subscribers');
    };
  },

  dispose() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    console.log('[Hivelet] notifications module disposed');
  }
};
