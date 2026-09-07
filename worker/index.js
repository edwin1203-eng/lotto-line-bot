import botModule from '../src/line-lotto649.js';

const { handler } = botModule;

function loadEnvironment(env) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') process.env[key] = value;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/webhook' && url.pathname !== '/status') {
      return env.ASSETS.fetch(request);
    }

    loadEnvironment(env);
    const raw = Buffer.from(await request.arrayBuffer());
    const event = {
      httpMethod: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: raw.toString('base64'),
      isBase64Encoded: true
    };
    const result = await handler(event);
    return new Response(result.body || '', {
      status: result.statusCode || 200,
      headers: result.headers || {}
    });
  }
};
