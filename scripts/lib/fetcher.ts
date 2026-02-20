/**
 * Rate-limited HTTP client for Vietnamese legislation sources.
 *
 * Primary source: Thu Vien Phap Luat (thuvienphapluat.vn) - comprehensive
 * Vietnamese legal database with full-text legislation in Vietnamese and
 * partial English translations.
 *
 * Fallback source: Van Ban Chinh Phu (vanban.chinhphu.vn) - Official Gazette
 * of the Government of the Socialist Republic of Vietnam.
 *
 * - 500ms minimum delay between requests (be respectful to government servers)
 * - User-Agent header identifying the MCP
 * - Retry logic with exponential backoff on 429/5xx
 * - No auth needed (Open Access / Government Open Data)
 */

const USER_AGENT = 'Vietnamese-Law-MCP/1.0 (https://github.com/Ansvar-Systems/vietnamese-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi,en;q=0.5',
        },
        redirect: 'follow',
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      }

      const body = await response.text();
      return {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
        url: response.url,
      };
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Network error for ${url}: ${msg}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}
