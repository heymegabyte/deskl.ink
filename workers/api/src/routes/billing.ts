import { Hono } from 'hono';
import type { AppContext } from '../observability.js';
import { getRegistry, resolveAuth } from './desktops.js';

const billing = new Hono<AppContext>();

billing.get('/wallet', async (c) => {
  const auth = await resolveAuth(c);
  if (!auth || auth.admin) return c.json({ ok: false, error: 'unauthorized' }, 401);
  return c.json(await getRegistry(c.env).wallet(auth.id));
});

export default billing;
