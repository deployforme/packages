'use strict';

module.exports = {
  name: 'orders',
  version: '1.0.0',

  register(context) {
    context.logger.log('[Hivelet] Registering orders module (DI / NestJS)');

    const db = context.container.get('database');

    context.http.registerRoute({
      id: 'orders-list',
      method: 'GET',
      path: '/orders',
      handler: async () => ({
        count: db.orders.size,
        items: Array.from(db.orders.values())
      })
    });

    context.http.registerRoute({
      id: 'orders-create',
      method: 'POST',
      path: '/orders',
      handler: async (req, res) => {
        const body = req.body || {};
        const id = body.id != null ? String(body.id) : String(db.nextId());
        const sku = body.sku != null ? String(body.sku) : '';

        if (sku.length === 0) {
          res.status(400).json({ error: 'sku is required' });
          return;
        }

        const order = { id, sku, status: 'created', createdAt: new Date().toISOString() };
        db.orders.set(id, order);
        return order;
      }
    });

    context.http.registerRoute({
      id: 'orders-get',
      method: 'GET',
      path: '/orders/:id',
      handler: async (req, res) => {
        const order = db.orders.get(String(req.params.id));
        if (!order) {
          res.status(404).json({ error: 'order not found' });
          return;
        }
        return order;
      }
    });
  }
};
