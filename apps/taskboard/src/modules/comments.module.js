'use strict';

module.exports = {
  name: 'comments',
  version: '1.0.0',

  register(context) {
    const store = context.container.get('commentStore');
    const taskStore = context.container.get('taskStore');
    context.logger.log('[Hivelet] comments module registering');

    context.http.registerRoute({
      id: 'comments-list',
      method: 'GET',
      path: '/tasks/:id/comments',
      handler: async (req, res) => {
        const taskId = String(req.params.id);
        if (!taskStore.get(taskId)) {
          res.status(404).json({ error: 'task not found' });
          return;
        }
        return { count: store.listForTask(taskId).length, items: store.listForTask(taskId) };
      }
    });

    context.http.registerRoute({
      id: 'comments-add',
      method: 'POST',
      path: '/tasks/:id/comments',
      handler: async (req, res) => {
        const taskId = String(req.params.id);
        if (!taskStore.get(taskId)) {
          res.status(404).json({ error: 'task not found' });
          return;
        }
        const body = req.body || {};
        const author = typeof body.author === 'string' ? body.author.trim() : '';
        const text = typeof body.body === 'string' ? body.body.trim() : '';
        if (author.length === 0 || text.length === 0) {
          res.status(400).json({ error: 'author and body are required' });
          return;
        }
        return store.add(taskId, author, text);
      }
    });

    context.http.registerRoute({
      id: 'comments-delete',
      method: 'DELETE',
      path: '/comments/:id',
      handler: async (req) => ({ id: req.params.id, deleted: store.delete(String(req.params.id)) })
    });
  },

  dispose() {
    console.log('[Hivelet] comments module disposed (clearing in-memory state)');
  }
};
