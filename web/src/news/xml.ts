/** Text and attribute values for hand-built XML (sitemaps, RSS). */
export function escapeXml(value: string): string {
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // Characters XML 1.0 forbids outright.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

export function xmlResponse(body: string, contentType = 'application/xml') {
  return new Response(body, {
    headers: {
      'content-type': `${contentType}; charset=utf-8`,
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
