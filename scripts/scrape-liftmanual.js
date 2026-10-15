// Crawl liftmanual.com's strength exercises into a local cache (scrape/liftmanual/, gitignored).
// Personal, local use only — the pages and media are © Lift Manual / Gym visual; never publish them.
//
//   node scripts/scrape-liftmanual.js            # crawl (resumable: cached pages/media are skipped)
//   node scripts/scrape-liftmanual.js --parse    # only re-parse cached pages into exercises.json
//
// Polite: one request at a time with a pause between them; robots.txt allows everything but /wp-admin/.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'scrape', 'liftmanual');
const PAGES = path.join(OUT, 'pages');
const MEDIA = path.join(OUT, 'media');
const INDEX_URL = 'https://liftmanual.com/strength/';
const DELAY_MS = 900;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GymLog-personal-importer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const text = (html) => decode(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function get(url, { binary = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await sleep(3000 * attempt);
    }
  }
}

// Slugs from the A–Z list on the Strength category page.
function indexSlugs(html) {
  const block = html.slice(html.indexOf('dynamic-term-description'));
  return [...new Set([...block.matchAll(/<li><a href="https:\/\/liftmanual\.com\/([a-z0-9-]+)\/">/g)].map((m) => m[1]))];
}

// Section of the article that follows a heading ending with `title` (e.g. "Instructions").
function sectionAfter(html, title) {
  const re = new RegExp(`<h2[^>]*>[^<]*${title}</h2>([\\s\\S]*?)(?=<h2|$)`);
  const m = html.match(re);
  return m ? m[1] : '';
}
const items = (html, tag) => {
  const list = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return list ? [...list[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1])).filter(Boolean) : [];
};
const terms = (html, kind) => [...html.matchAll(new RegExp(`href="https://liftmanual\\.com/${kind}/([a-z0-9-]+)/">([^<]+)</a>`, 'g'))].map((m) => ({ slug: m[1], label: decode(m[2]) }));

function parsePage(slug, html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [html])[0];
  const name = text((main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const article = (html.match(/<article[^>]+class="([^"]+)"/) || [])[1] || '';
  const mgStart = main.indexOf('<strong>Muscle Group</strong>');
  const eqStart = main.indexOf('<strong>Equipment Required</strong>');
  const muscleGroups = mgStart >= 0 ? terms(main.slice(mgStart, eqStart > mgStart ? eqStart : mgStart + 3000), 'muscle') : [];
  const equipment = eqStart >= 0 ? terms(main.slice(eqStart, eqStart + 3000), 'equipment') : [];
  const visual = sectionAfter(main, 'Form &amp; Visual') || sectionAfter(main, 'Form & Visual');
  const anim = (visual.match(/src="(https:\/\/liftmanual\.com\/wp-content\/uploads\/[^"]+\.(?:webp|gif))"/) || [])[1] || null;
  return {
    slug,
    url: `https://liftmanual.com/${slug}/`,
    name,
    strength: /\bcategory-strength\b/.test(article),
    muscleGroups,
    equipment,
    instructions: items(sectionAfter(main, 'Instructions'), 'ol'),
    musclesWorked: items(sectionAfter(main, 'Muscles Worked'), 'ul'),
    anim,
  };
}

async function main() {
  fs.mkdirSync(PAGES, { recursive: true });
  fs.mkdirSync(MEDIA, { recursive: true });
  const parseOnly = process.argv.includes('--parse');

  const indexFile = path.join(OUT, 'index.html');
  if (!fs.existsSync(indexFile)) fs.writeFileSync(indexFile, await get(INDEX_URL));
  const slugs = indexSlugs(fs.readFileSync(indexFile, 'utf8'));
  console.log(`${slugs.length} exercises in the strength index`);

  const results = [];
  let fetched = 0;
  for (const [i, slug] of slugs.entries()) {
    const pageFile = path.join(PAGES, `${slug}.html`);
    if (!fs.existsSync(pageFile)) {
      if (parseOnly) continue;
      const html = await get(`https://liftmanual.com/${slug}/`);
      fs.writeFileSync(pageFile, html || '');
      fetched++;
      await sleep(DELAY_MS);
    }
    const html = fs.readFileSync(pageFile, 'utf8');
    if (!html) continue; // 404
    const ex = parsePage(slug, html);
    if (ex.anim) {
      ex.animFile = `${slug}${path.extname(new URL(ex.anim).pathname)}`;
      const mediaFile = path.join(MEDIA, ex.animFile);
      if (!fs.existsSync(mediaFile) && !parseOnly) {
        const buf = await get(ex.anim, { binary: true });
        if (buf) fs.writeFileSync(mediaFile, buf);
        fetched++;
        await sleep(DELAY_MS);
      }
      if (!fs.existsSync(mediaFile)) delete ex.animFile;
    }
    results.push(ex);
    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${slugs.length} (${fetched} downloads so far)`);
      fs.writeFileSync(path.join(OUT, 'exercises.json'), JSON.stringify(results, null, 1));
    }
  }
  fs.writeFileSync(path.join(OUT, 'exercises.json'), JSON.stringify(results, null, 1));
  const withAnim = results.filter((r) => r.animFile).length;
  console.log(`Done: ${results.length} parsed, ${withAnim} with an animation, ${results.filter((r) => !r.strength).length} not tagged strength.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
