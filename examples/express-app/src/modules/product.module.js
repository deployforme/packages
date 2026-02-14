module.exports = {
  name: 'product',
  version: '1.0.0',
  
  register(context) {
    context.logger.log('[Deploy4Me] Registering product module routes');
    
    context.http.registerRoute({
      id: 'product-list',
      method: 'GET',
      path: '/products',
      handler: async () => {
        return { 
          products: [
            { id: 1, name: 'Laptop', price: 999 },
            { id: 3, name: 'Fare', price: 999 },
            { id: 2, name: 'Mouse', price: 29 }
          ] 
        };
      }
    });

    context.http.registerRoute({
      id: 'product-create',
      method: 'POST',
      path: '/products',
      handler: async (req) => {
        return { 
          success: true, 
          product: { id: 3, ...req.body } 
        };
      }
    });
  },

  dispose() {
    console.log('[Deploy4Me] Product module disposed');
  }
};
