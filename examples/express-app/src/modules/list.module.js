module.exports = {
  name: 'list',
  version: '2.0.0',
  
  register(context) {
    context.logger.log('Registering list module routes - VERSION 2.0!');
    
    context.http.registerRoute({
      id: 'list',
      method: 'GET',
      path: '/list',
      handler: async (req, res) => {
        return { 
          users: ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
          version: '2.0.0',
          timestamp: new Date().toISOString()
        };
      }
    });
  },

  dispose() {
    console.log('User list disposed');
  }
};
