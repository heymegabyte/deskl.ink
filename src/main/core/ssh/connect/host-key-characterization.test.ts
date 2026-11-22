import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { connect, createServer, type Server as TcpServer } from 'node:net';
import { Server } from 'ssh2';
import { describe, expect, it } from 'vitest';
import { resolveSshConnectConfig } from './resolve-ssh-connect-config';
import { testSshConnection } from './test-connection';

function newHostKey() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
}

async function startSshServer(hostKey: string, port = 0) {
  const server = new Server({ hostKeys: [hostKey] });
  server.on('connection', (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'alice' && ctx.password === 'secret') {
        ctx.accept();
      } else {
        ctx.reject();
      }
    });
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return { server, port: address.port };
}

async function close(server: Server | TcpServer) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

describe('destination host-key behavior', () => {
  it.each(['direct', 'proxied'] as const)(
    'currently accepts a changed destination key over a %s connection',
    async (transport) => {
      const firstKey = newHostKey();
      const secondKey = newHostKey();
      expect(firstKey).not.toBe(secondKey);
      const initial = await startSshServer(firstKey);
      let server = initial.server;
      const port = initial.port;
      const proxy = createServer((client) => {
        const upstream = connect(port, '127.0.0.1');
        client.pipe(upstream).pipe(client);
      });
      proxy.listen(0, '127.0.0.1');
      await once(proxy, 'listening');
      const address = proxy.address();
      if (!address || typeof address === 'string') throw new Error('Expected proxy TCP address');
      const proxyPort = address.port;
      const config = {
        id: '',
        name: 'Disposable',
        host: '127.0.0.1',
        port,
        username: 'alice',
        authType: 'password' as const,
        password: 'secret',
        ...(transport === 'proxied' ? { proxyJump: 'disposable' } : {}),
      };
      const resolve = (input: Parameters<typeof resolveSshConnectConfig>[0]) =>
        resolveSshConnectConfig(input, {
          spawnProxyJump: () => {
            const sock = connect(proxyPort, '127.0.0.1');
            return { sock, cleanup: () => sock.destroy(), debugLogs: [] };
          },
        });
      try {
        expect((await testSshConnection(config, { resolve })).success).toBe(true);
        await close(server);
        ({ server } = await startSshServer(secondKey, port));
        expect((await testSshConnection(config, { resolve })).success).toBe(true);
      } finally {
        await close(server);
        await close(proxy);
      }
    }
  );
});
