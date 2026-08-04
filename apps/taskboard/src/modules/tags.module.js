'use strict';

module.exports = {
  name: 'tags',
  version: '1.0.0',

  register(context) {
    const store = context.container.get('tagStore');
    context.logger.log('[Hivelet] tags module registering');

    context.http.registerRoute({
      id: 'tags-list',
      method: 'GET',
      path: '/tags',
      handler: async () => ({ count: store.list().length, items: store.list() })
    });

    context.http.registerRoute({
      id: 'tags-create',
      method: 'POST',
      path: '/tags',
      handler: async (req, res) => {
        const body = req.body || {};
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length === 0) {
          res.status(400).json({ error: 'name is required' });
          return;
        }
        const color = typeof body.color === 'string' ? body.color.trim() : 'gray';
        return store.create(name, color);
      }
    });

    context.http.registerRoute({
      id: 'tags-get',
      method: 'GET',
      path: '/tags/:id',
      handler: async (req, res) => {
        const tag = store.get(String(req.params.id));
        if (!tag) {
          res.status(404).json({ error: 'tag not found' });
          return;
        }
        return tag;
      }
    });
  },

  dispose() {
    console.log('[Hivelet] tags module disposed');
  }
};
