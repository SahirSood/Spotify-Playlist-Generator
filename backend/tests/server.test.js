process.env.AWS_EXECUTION_ENV = 'test';
process.env.DYNAMODB_REGION = process.env.DYNAMODB_REGION || 'us-east-1';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { URL } = require('node:url');

const app = require('../server');
const expectedFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

async function withServer(run) {
  const server = app.listen(0);
  try {
    return await run(server);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function makeRequest(server, path, { method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const address = server.address();
    const requestHeaders = { ...headers };

    if (payload) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: Object.keys(requestHeaders).length ? requestHeaders : undefined,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsedBody = data || null;
          if (data) {
            try {
              parsedBody = JSON.parse(data);
            } catch {
              parsedBody = data;
            }
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('GET / returns health payload with documented endpoints', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/');

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.message, 'Spotify Playlist Generator Backend is running!');
    assert.ok(Array.isArray(response.body.endpoints));
    assert.ok(response.body.endpoints.includes('POST /generate-playlist - Generate playlist from natural language request'));
  });
});

test('GET /login redirects to Spotify auth and sets an oauth state cookie', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/login');

    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /^https:\/\/accounts\.spotify\.com\/authorize\?/);
    assert.ok(Array.isArray(response.headers['set-cookie']));
    assert.match(response.headers['set-cookie'][0], /spotify_oauth_state=/);
  });
});

test('GET /callback rejects mismatched oauth state', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/callback?code=test-code&state=wrong-state', {
      headers: {
        Cookie: 'spotify_oauth_state=expected-state',
      },
    });

    assert.equal(response.statusCode, 302);
    const redirectUrl = new URL(response.headers.location);
    const frontendUrl = new URL(expectedFrontendUrl);
    assert.equal(redirectUrl.origin, frontendUrl.origin);
    assert.equal(redirectUrl.pathname, '/dashboard');
    assert.equal(redirectUrl.searchParams.get('error'), 'state_mismatch');
    assert.ok(Array.isArray(response.headers['set-cookie']));
    assert.match(response.headers['set-cookie'][0], /spotify_oauth_state=;/);
  });
});

test('GET /clusters rejects requests without user_id', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/clusters');

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'user_id is required' });
  });
});

test('GET /cluster-status rejects requests without user_id', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/cluster-status');

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'user_id is required' });
  });
});

test('POST /refresh rejects requests without refresh_token', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/refresh', {
      method: 'POST',
      body: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Refresh token is required' });
  });
});

test('GET /log-listening rejects requests without access_token', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/log-listening');

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'Access token is required as query parameter',
      example: '/log-listening?access_token=YOUR_TOKEN_HERE&userId=test123',
    });
  });
});

test('POST /log-listening rejects requests without access_token', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/log-listening', {
      method: 'POST',
      body: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Access token is required' });
  });
});

test('POST /save-tokens rejects requests without all required fields', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/save-tokens', {
      method: 'POST',
      body: { user_id: 'spotify:user:test' },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'user_id, access_token and refresh_token are required',
    });
  });
});

test('POST /sync-and-cluster rejects requests without user_id', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/sync-and-cluster', {
      method: 'POST',
      body: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'user_id is required' });
  });
});

test('POST /generate-playlist rejects requests without required fields', async () => {
  await withServer(async (server) => {
    const response = await makeRequest(server, '/generate-playlist', {
      method: 'POST',
      body: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'access_token, user_id, and request are required',
    });
  });
});
