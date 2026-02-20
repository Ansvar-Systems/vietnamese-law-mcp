/**
 * Response metadata utilities for Australian Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Federal Register of Legislation (legislation.gov.au) — Australian Government, Office of Parliamentary Counsel',
    jurisdiction: 'AU',
    disclaimer:
      'This data is sourced from the Federal Register of Legislation under CC BY 4.0 licence. ' +
      'The authoritative versions are maintained by the Australian Government. ' +
      'Always verify with the official Federal Register of Legislation portal (legislation.gov.au).',
    freshness,
  };
}
