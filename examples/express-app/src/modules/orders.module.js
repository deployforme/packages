'use strict';

const ORDERS = new Map();

function badRequest(res, message) {
  res.status(400).json({ error: message });
}

module.exports = {
  name: 'orders',
  version: '1.0.0',

  register(context) {
    context.logger.log('[Hivelet] Registering orders module (DI)');

    const db = context.container.get('database');

    context.http.registerRoute({
      id: 'orders-list',
      method: 'GET',
      path: '/orders',
      handler: async () => ({
        count: ORDERS.size,
        items: Array.from(ORDERS.values())
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
          badRequest(res, 'sku is required');
          return;
        }

        const order = { id, sku, status: 'created', createdAt: new Date().toISOString() };
        ORDERS.set(id, order);
        return order;
      }
    });

    context.http.registerRoute({
      id: 'orders-get',
      method: 'GET',
      path: '/orders/:id',
      handler: async (req, res) => {
        const order = ORDERS.get(String(req.params.id));
        if (!order) {
          res.status(404).json({ error: 'order not found' });
          return;
        }
        return order;
      }
    });

    context.http.registerRoute({
      id: 'orders-delete',
      method: 'DELETE',
      path: '/orders/:id',
      handler: async (req, res) => {
        const id = String(req.params.id);
        const existed = ORDERS.delete(id);
        return { id, deleted: existed };
      }
    });
  },

  dispose() {
    ORDERS.clear();
    console.log('[Hivelet] Orders module disposed');
  }
};
