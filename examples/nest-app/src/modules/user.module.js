module.exports = {
  name: 'user',
  version: '1.0.0',
  
  register(context) {
    context.logger.log('Registering user module routes (NestJS)');
    
    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async (req, res) => {
        return { users: ['Alice', 'Bob', 'Charlie'] };
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

    context.http.registerRoute({
      id: 'user-create',
      method: 'POST',
      path: '/users',
      handler: async (req, res) => {
        const { email, password } = req.body || {};
        
        return { 
          message: 'User created',
          email,
          id: Math.floor(Math.random() * 1000)
        };
      }
    });
  },

  dispose() {
    console.log('User module disposed (NestJS)');
  }
};
