#!/usr/bin/env tsx
/**
 * Vietnamese Law MCP — Census-Driven Ingestion Pipeline
 *
 * Fetches Vietnamese legislation from Thu Vien Phap Luat (thuvienphapluat.vn).
 * Census-driven: reads data/census.json to enumerate ALL laws.
 *
 * Pipeline:
 * 1. Load census.json (or fall back to KEY_VIETNAMESE_ACTS from parser.ts)
 * 2. For each law: fetch HTML, parse articles ("Điều N." pattern), extract definitions
 * 3. Save structured seed JSON files for build-db.ts
 *
 * Usage:
 *   npm run ingest                    # Full ingestion from census
 *   npm run ingest -- --limit 5       # Test with 5 laws
 *   npm run ingest -- --skip-fetch    # Reuse cached HTML
 *   npm run ingest -- --resume        # Skip laws that already have seed files
 *
 * Data sources:
 *   - Primary: thuvienphapluat.vn (Open Access)
 *   - Fallback: vanban.chinhphu.vn (Government Open Data)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parseVietnameseHtml, KEY_VIETNAMESE_ACTS, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

// Census types
interface CensusLaw {
  id: string;
  title: string;
  title_en: string;
  short_name: string;
  official_number: string;
  type: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description: string;
  classification: 'ingestable' | 'inaccessible' | 'metadata_only';
}

interface CensusData {
  generated_at: string;
  stats: { total: number; class_ingestable: number };
  laws: CensusLaw[];
}

function parseArgs(): { limit: number | null; skipFetch: boolean; resume: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let resume = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    } else if (args[i] === '--resume') {
      resume = true;
    }
  }

  return { limit, skipFetch, resume };
}

/**
 * Convert a census law entry into the ActIndexEntry format used by the parser.
 */
function censusLawToIndexEntry(law: CensusLaw): ActIndexEntry {
  return {
    id: law.id,
    title: law.title,
    titleEn: law.title_en,
    shortName: law.short_name,
    status: law.status,
    issuedDate: law.issued_date,
    inForceDate: law.in_force_date,
    url: law.url,
    officialNumber: law.official_number,
    description: law.description,
  };
}

/**
 * Load acts from census.json if available, otherwise fall back to KEY_VIETNAMESE_ACTS.
 */
function loadActList(): ActIndexEntry[] {
  if (fs.existsSync(CENSUS_PATH)) {
    const raw = fs.readFileSync(CENSUS_PATH, 'utf-8');
    const census = JSON.parse(raw) as CensusData;

    console.log(`  Census: ${census.stats.total} laws (generated ${census.generated_at})`);

    const ingestable = census.laws.filter(a => a.classification === 'ingestable');
    console.log(`  Ingestable: ${ingestable.length} laws`);

    return ingestable.map(censusLawToIndexEntry);
  }

  console.log('  WARNING: No census.json found -- falling back to KEY_VIETNAMESE_ACTS (10 acts)');
  console.log('  Run: npx tsx scripts/census.ts   to generate full census\n');
  return KEY_VIETNAMESE_ACTS;
}

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean, resume: boolean): Promise<void> {
  console.log(`\nProcessing ${acts.length} Vietnamese laws...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let resumed = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const startTime = Date.now();

  const report: { act: string; provisions: number; definitions: number; status: string }[] = [];

  for (const act of acts) {
    const sourceFile = path.join(SOURCE_DIR, `${act.id}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    // Resume support: skip acts that already have seed files
    if (resume && fs.existsSync(seedFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
        totalProvisions += existing.provisions?.length ?? 0;
        totalDefinitions += existing.definitions?.length ?? 0;
      } catch { /* ignore parse errors on resume */ }
      resumed++;
      processed++;
      continue;
    }

    // Skip if seed already exists and we're in skip-fetch mode
    if (skipFetch && fs.existsSync(seedFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
        const provCount = existing.provisions?.length ?? 0;
        const defCount = existing.definitions?.length ?? 0;
        totalProvisions += provCount;
        totalDefinitions += defCount;
        report.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'cached' });
      } catch { /* ignore */ }
      skipped++;
      processed++;
      continue;
    }

    try {
      let html: string | null = null;

      if (fs.existsSync(sourceFile) && skipFetch) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        console.log(`  Using cached ${act.shortName} (${act.officialNumber})`);
      } else if (!skipFetch) {
        process.stdout.write(`  [${processed + 1}/${acts.length}] Fetching ${act.shortName} (${act.officialNumber})...`);
        try {
          const result = await fetchWithRateLimit(act.url);

          if (result.status === 200 && result.body.length > 1000) {
            html = result.body;
            fs.writeFileSync(sourceFile, html);
            console.log(` OK (${(html.length / 1024).toFixed(0)} KB)`);
          } else {
            console.log(` HTTP ${result.status} (${result.body.length} bytes) -- metadata only`);
          }
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          console.log(` FETCH FAILED: ${msg.substring(0, 80)} -- metadata only`);
        }
      }

      let parsed: ParsedAct;

      if (html && html.length > 1000) {
        parsed = parseVietnameseHtml(html, act);
        console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);
      } else {
        // Create metadata-only seed with no provisions (will be counted but not useful for search)
        parsed = {
          id: act.id,
          type: 'statute',
          title: act.title,
          title_en: act.titleEn,
          short_name: act.shortName,
          status: act.status,
          issued_date: act.issuedDate,
          in_force_date: act.inForceDate,
          url: act.url,
          description: act.description,
          provisions: [],
          definitions: [],
        };
        console.log(`    -> Metadata only (no HTML fetched)`);
      }

      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;

      report.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: html ? 'OK' : 'metadata',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${act.shortName}: ${msg}`);
      report.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 60)}` });
      failed++;
    }

    processed++;

    // Progress log every 25 acts
    if (processed % 25 === 0 && processed < acts.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const eta = ((Date.now() - startTime) / processed * (acts.length - processed) / 1000).toFixed(0);
      console.log(`\n  --- Progress: ${processed}/${acts.length} (${elapsed}s elapsed, ~${eta}s remaining) ---\n`);
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('INGESTION REPORT');
  console.log('='.repeat(70));

  if (report.length > 0 && report.length <= 120) {
    console.log(`\n  ${'Act'.padEnd(25)} ${'Prov'.padEnd(8)} ${'Defs'.padEnd(8)} Status`);
    console.log(`  ${'-'.repeat(65)}`);
    for (const r of report) {
      console.log(
        `  ${r.act.substring(0, 24).padEnd(25)} ${String(r.provisions).padEnd(8)} ${String(r.definitions).padEnd(8)} ${r.status}`
      );
    }
  } else if (report.length > 120) {
    const okCount = report.filter(r => r.status === 'OK').length;
    const metaCount = report.filter(r => r.status === 'metadata').length;
    const failCount = report.filter(r => r.status.startsWith('ERROR')).length;
    console.log(`\n  OK:        ${okCount}`);
    console.log(`  Metadata:  ${metaCount}`);
    console.log(`  Failed:    ${failCount}`);
    if (failCount > 0) {
      console.log('\n  Failed laws:');
      for (const r of report.filter(r => r.status.startsWith('ERROR'))) {
        console.log(`    ${r.act.padEnd(25)} ${r.status}`);
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Elapsed:         ${totalElapsed}s`);
  console.log(`  Processed:       ${processed}`);
  console.log(`  Resumed:         ${resumed}`);
  console.log(`  Cached:          ${skipped}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);

  // Update census.json with ingestion stats
  if (fs.existsSync(CENSUS_PATH)) {
    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));
    census.ingestion = {
      completed_at: new Date().toISOString(),
      total_laws: processed - failed,
      total_provisions: totalProvisions,
      coverage_pct: ((processed - failed) / acts.length * 100).toFixed(1),
    };
    fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2) + '\n');
    console.log(`\n  Updated census.json with ingestion stats.`);
  }
}

async function main(): Promise<void> {
  const { limit, skipFetch, resume } = parseArgs();

  console.log('Vietnamese Law MCP -- Census-Driven Ingestion Pipeline');
  console.log('======================================================\n');
  console.log(`  Source:  Thu Vien Phap Luat (thuvienphapluat.vn)`);
  console.log(`  Method:  HTML scrape + article parser`);
  console.log(`  License: Open Access / Government Open Data`);
  console.log(`  Rate limit: 500ms between requests`);

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log(`  --skip-fetch`);
  if (resume) console.log(`  --resume (skip existing seed files)`);

  const allActs = loadActList();
  const acts = limit ? allActs.slice(0, limit) : allActs;
  await fetchAndParseActs(acts, skipFetch, resume);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
