/* Netlify Edge Function: proxy HTTP/HTTPS requests so the browser app
   (served over HTTPS) can talk to HTTP Xtream servers without mixed-content
   blocking. Use with care: credentials in URLs pass through Netlify's edge. */

export default async (request) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');

  if (!target) {
    return new Response('Missing target query parameter', { status: 400 });
  }

  if (!/^https?:\/\//i.test(target)) {
    return new Response('Invalid target URL', { status: 400 });
  }

  // Respond to CORS preflight checks. The app calls this endpoint same-origin,
  // but preflight support makes the proxy usable from other contexts too.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
};
