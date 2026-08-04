module.exports = {
  name: 'user',
  version: '4.0.0',

  register(context) {
    context.logger.log('[Hivelet] Registering user module routes');

    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async (req, res) => {
        return {
          users: ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
          version: '2.0.0',
          timestamp: new Date().toISOString()
        };
      }
    });

    context.http.registerRoute({
      id: 'user-get',
      method: 'GET',
      path: '/users/:id',
      handler: async (req, res) => {
        return { id: req.params.id, name: 'User ' + req.params.id };
      }
    });
  },

  dispose() {
    console.log('[Hivelet] User module disposed');
  }
};
