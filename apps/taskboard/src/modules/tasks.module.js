'use strict';

module.exports = {
  name: 'tasks',
  version: '1.0.0',

  register(context) {
    const store = context.container.get('taskStore');
    const tagStore = context.container.get('tagStore');
    context.logger.log('[Hivelet] tasks module registering');

    context.http.registerRoute({
      id: 'tasks-list',
      method: 'GET',
      path: '/tasks',
      handler: async (req) => {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const tagId = typeof req.query.tagId === 'string' ? req.query.tagId : undefined;
        return { count: store.list({ status, tagId }).length, items: store.list({ status, tagId }) };
      }
    });

    context.http.registerRoute({
      id: 'tasks-create',
      method: 'POST',
      path: '/tasks',
      handler: async (req, res) => {
        const body = req.body || {};
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (title.length === 0) {
          res.status(400).json({ error: 'title is required' });
          return;
        }
        const tagIds = Array.isArray(body.tagIds) ? body.tagIds.filter(id => tagStore.has(String(id))) : [];
        return store.create({ title, tagIds });
      }
    });

    context.http.registerRoute({
      id: 'tasks-get',
      method: 'GET',
      path: '/tasks/:id',
      handler: async (req, res) => {
        const task = store.get(String(req.params.id));
        if (!task) {
          res.status(404).json({ error: 'task not found' });
          return;
        }
        return task;
      }
    });

    context.http.registerRoute({
      id: 'tasks-update',
      method: 'PATCH',
      path: '/tasks/:id',
      handler: async (req, res) => {
        const body = req.body || {};
        const patch = {};
        if (typeof body.title === 'string') patch.title = body.title.trim();
        if (typeof body.status === 'string') patch.status = body.status;
        if (Array.isArray(body.tagIds)) patch.tagIds = body.tagIds.filter(id => tagStore.has(String(id)));

        const updated = store.update(String(req.params.id), patch);
        if (!updated) {
          res.status(404).json({ error: 'task not found' });
          return;
        }
        return updated;
      }
    });

    context.http.registerRoute({
      id: 'tasks-complete',
      method: 'POST',
      path: '/tasks/:id/complete',
      handler: async (req, res) => {
        const updated = store.update(String(req.params.id), { status: 'done' });
        if (!updated) {
          res.status(404).json({ error: 'task not found' });
          return;
        }
        return updated;
      }
    });

    context.http.registerRoute({
      id: 'tasks-delete',
      method: 'DELETE',
      path: '/tasks/:id',
      handler: async (req) => {
        const removed = store.delete(String(req.params.id));
        return { id: req.params.id, deleted: removed };
      }
    });
  },

  dispose() {
    console.log('[Hivelet] tasks module disposed');
  }
};
