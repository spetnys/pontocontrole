import { promises as fs } from 'node:fs';

const fallbackUrl = 'https://www.mercadolivre.com.br/pagina/varinha';
const defaultProductsFile = process.env.PRODUCTS_FILE || '/var/lib/docker/volumes/wine_adegaweb_data/_data/products.json';
const reportFile = process.env.REPORT_FILE || '/root/codex/wine/mercadolivre-link-report.json';
const dryRun = process.argv.includes('--dry-run');
const webSearch = process.argv.includes('--web-search');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.replace('--limit=', '')) : 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function stripHtml(value) {
  return decodeHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function productSku(product) {
  return compactWhitespace(product.olist?.sku || product.olist?.reference || '');
}

function productGtin(product) {
  return compactWhitespace(product.olist?.gtin || '');
}

function specificMercadoLivreUrl(value) {
  const url = String(value || '');
  return (
    /mercadolivre\.com\.br/i.test(url) &&
    (/\/p\/MLB\d+/i.test(url) ||
      /\/MLB-?\d+/i.test(url) ||
      /\/up\/MLBU\d+/i.test(url) ||
      /(?:item_id|wid)(?:%3A|=)MLB\d+/i.test(url))
  );
}

function directMlbUrl(sku) {
  const match = String(sku || '').match(/^MLB(\d+)$/i);
  return match ? `https://produto.mercadolivre.com.br/MLB-${match[1]}` : '';
}

function mercadoLivreIds(value) {
  const ids = new Set();
  for (const match of String(value || '').matchAll(/MLB-?(\d+)/gi)) ids.add(`MLB${match[1]}`);
  for (const match of String(value || '').matchAll(/MLBU(\d+)/gi)) ids.add(`MLBU${match[1]}`);
  return ids;
}

function cleanMercadoLivreUrl(value) {
  const cleaned = decodeHtml(value).replaceAll('&amp;', '&');
  try {
    const url = new URL(cleaned);
    const itemFilter = url.searchParams.get('pdp_filters');
    const next = new URL(`${url.origin}${url.pathname}`);
    if (itemFilter && /item_id:MLB\d+/i.test(itemFilter)) {
      next.searchParams.set('pdp_filters', itemFilter);
    }
    return next.toString();
  } catch {
    return cleaned.split('#')[0];
  }
}

function titleScore(left, right) {
  const leftTokens = new Set(normalize(left).split(' ').filter((token) => token.length > 2));
  const rightTokens = new Set(normalize(right).split(' ').filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;

  const leftText = normalize(left);
  const rightText = normalize(right);
  let leftHits = 0;
  let rightHits = 0;

  for (const token of leftTokens) {
    if (rightText.includes(token)) leftHits += 1;
  }
  for (const token of rightTokens) {
    if (leftText.includes(token)) rightHits += 1;
  }

  return Math.min(leftHits / leftTokens.size, rightHits / rightTokens.size);
}

function parseSellerProducts(html) {
  const normalizedHtml = String(html || '')
    .replace(/\\u002F/g, '/')
    .replace(/\\"/g, '"')
    .replaceAll('&amp;', '&');

  const products = [...normalizedHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="poly-component__title"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => ({
      url: cleanMercadoLivreUrl(match[1]),
      title: stripHtml(match[2]),
    }))
    .filter((product) => product.title && specificMercadoLivreUrl(product.url))
    .map((product) => ({ ...product, ids: mercadoLivreIds(product.url) }));

  const seen = new Set();
  return products.filter((product) => {
    const ids = [...product.ids].sort().join(',');
    const key = `${normalize(product.title)}|${ids || product.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSellerProducts() {
  const urls = [fallbackUrl, `${fallbackUrl}/menu`];
  const products = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) products.push(...parseSellerProducts(await response.text()));
    } catch {
      console.warn(`seller page failed: ${url}`);
    }
  }

  const seen = new Set();
  return products.filter((product) => {
    const ids = [...product.ids].sort().join(',');
    const key = `${normalize(product.title)}|${ids || product.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findSellerProduct(product, sellerProducts) {
  const sku = productSku(product).replace(/^MLB-?/i, 'MLB');
  if (sku) {
    const bySku = sellerProducts.find((sellerProduct) => sellerProduct.ids.has(sku));
    if (bySku) return { url: bySku.url, source: 'seller-page-sku', score: 1 };
  }

  const candidates = sellerProducts
    .map((sellerProduct) => ({ ...sellerProduct, score: titleScore(product.title, sellerProduct.title) }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];

  if (best && best.score >= 0.82) {
    return { url: best.url, source: 'seller-page-title', score: Number(best.score.toFixed(2)) };
  }

  return null;
}

function decodeDuckDuckGoUrl(href) {
  const decoded = decodeHtml(href);
  try {
    const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded;
    const url = new URL(absolute);
    const target = url.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : absolute;
  } catch {
    return decoded;
  }
}

function tokenScore(product, candidate) {
  const productTokens = new Set(normalize(product.title).split(' ').filter((token) => token.length > 2));
  const candidateText = normalize(`${candidate.title} ${candidate.url}`);
  if (!productTokens.size) return 0;

  let hits = 0;
  for (const token of productTokens) {
    if (candidateText.includes(token)) hits += 1;
  }

  let score = hits / productTokens.size;
  const sku = productSku(product);
  const gtin = productGtin(product);
  if (sku && candidateText.includes(normalize(sku))) score += 0.3;
  if (gtin && candidateText.includes(normalize(gtin))) score += 0.3;
  return score;
}

function parseDuckDuckGoResults(html) {
  return [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => ({
      url: decodeDuckDuckGoUrl(match[1]),
      title: stripHtml(match[2]),
    }))
    .filter((result) => /mercadolivre\.com\.br/i.test(result.url))
    .filter((result) => specificMercadoLivreUrl(result.url));
}

async function searchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/?kl=br-pt&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];
    return parseDuckDuckGoResults(await response.text());
  } catch {
    console.warn(`search failed: ${compactWhitespace(query)}`);
    return [];
  }
}

async function findMercadoLivreUrl(product, cache, sellerProducts) {
  if (specificMercadoLivreUrl(product.link)) {
    return { url: product.link, source: 'kept-specific', score: 1 };
  }

  const sellerProduct = findSellerProduct(product, sellerProducts);
  if (sellerProduct) return sellerProduct;

  const directUrl = directMlbUrl(productSku(product));
  if (directUrl) {
    return { url: directUrl, source: 'sku-mlb-direct', score: 1 };
  }

  if (!webSearch) {
    return { url: fallbackUrl, source: 'fallback', score: 0 };
  }

  const queries = [
    productSku(product) ? `site:mercadolivre.com.br "${productSku(product)}" "${product.title}"` : '',
    productGtin(product) ? `site:mercadolivre.com.br "${productGtin(product)}" "${product.title}"` : '',
    `site:mercadolivre.com.br "${product.title}"`,
  ].filter(Boolean);

  for (const query of queries) {
    const cacheKey = normalize(query);
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, await searchDuckDuckGo(query));
      await sleep(350);
    }

    const candidates = cache.get(cacheKey)
      .map((candidate) => ({ ...candidate, score: tokenScore(product, candidate) }))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (best && best.score >= 0.62) {
      return { url: best.url, source: 'search-match', score: Number(best.score.toFixed(2)), query };
    }
  }

  return { url: fallbackUrl, source: 'fallback', score: 0 };
}

async function main() {
  const products = JSON.parse(await fs.readFile(defaultProductsFile, 'utf8'));
  const cache = new Map();
  const report = [];
  const targetProducts = limit > 0 ? products.slice(0, limit) : products;
  const sellerProducts = await fetchSellerProducts();

  console.log(`seller products found ${sellerProducts.length}`);

  for (const [index, product] of targetProducts.entries()) {
    const result = await findMercadoLivreUrl(product, cache, sellerProducts);
    report.push({
      index,
      id: product.id,
      title: product.title,
      sku: productSku(product),
      previousLink: product.link,
      nextLink: result.url,
      source: result.source,
      score: result.score,
      query: result.query || '',
    });

    product.link = result.url;
    if (product.olist && typeof product.olist === 'object') {
      product.olist.url = result.url;
    }

    if ((index + 1) % 25 === 0 || index + 1 === targetProducts.length) {
      console.log(`processed ${index + 1}/${targetProducts.length}`);
    }
  }

  const summary = report.reduce(
    (acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1;
      return acc;
    },
    { total: report.length },
  );

  await fs.writeFile(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), summary, report }, null, 2));
  if (!dryRun) {
    await fs.writeFile(defaultProductsFile, JSON.stringify(products, null, 2));
  }

  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) console.log('dry run: products file was not changed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
