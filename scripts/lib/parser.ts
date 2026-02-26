/**
 * HTML parser for Vietnamese legislation from Thu Vien Phap Luat (thuvienphapluat.vn)
 * and Van Ban Chinh Phu (vanban.chinhphu.vn).
 *
 * Vietnamese legislation uses the following structure:
 *   - "Điều X" (Article X) - primary provision numbering (Điều 1, Điều 2, ...)
 *   - "Chương" (Chapter) - chapter groupings (Chương I, Chương II, ...)
 *   - "Mục" (Section) - section groupings within chapters
 *   - "Khoản" (Clause/Paragraph) - sub-elements within articles (1., 2., ...)
 *   - "Điểm" (Point) - sub-elements within clauses (a), b), c), ...)
 *
 * Thu Vien Phap Luat marks articles with <a name="dieu_N"> anchor tags.
 * This is the primary extraction method (reliable, handles all document sizes).
 * Fallback: text-based "Điều N." pattern for other sources.
 *
 * Provision references use "dieu" prefix: dieu1, dieu2, dieu3, etc.
 */

export interface ActIndexEntry {
  id: string;
  title: string;
  titleEn: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
  url: string;
  officialNumber: string;
  description?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

/**
 * Strip HTML tags and decode common entities, normalising whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|tr|li|h[1-6]|br|section|article)\b[^>]*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#xA0;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u200B/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

/**
 * Parse Vietnamese legislation HTML to extract provisions (articles).
 *
 * Strategy:
 * 1. Primary: Use <a name="dieu_N"> anchor tags (thuvienphapluat.vn standard)
 *    - Find all unique anchors, extract content between consecutive anchors
 * 2. Fallback: Text-based "Điều N." pattern (for other HTML sources)
 *
 * Chapter headings ("Chương ...") are tracked for context.
 */
export function parseVietnameseHtml(html: string, act: ActIndexEntry): ParsedAct {
  // Try anchor-based extraction first (primary method for thuvienphapluat.vn)
  const anchorResult = parseByAnchors(html, act);
  if (anchorResult.provisions.length > 5) {
    return anchorResult;
  }

  // Fallback: text-based parsing
  return parseByTextPatterns(html, act);
}

/**
 * Primary parser: extract articles using <a name="dieu_N"> anchors.
 *
 * thuvienphapluat.vn HTML structure:
 *   <a name="dieu_N"><b>Điều N. Title text</b></a>
 *   <p>Content paragraphs...</p>
 *   ...
 *   <a name="dieu_N+1">...
 *
 * The anchors appear twice (once in TOC, once in body). We deduplicate
 * and keep the version with the most content.
 */
function parseByAnchors(html: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // Find all anchor positions: <a name="dieu_N">
  const anchorPattern = /<a\s+name="dieu_(\d+[a-zA-Z]?)"\s*>/gi;
  const anchors: { num: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    anchors.push({ num: match[1], index: match.index });
  }

  if (anchors.length === 0) {
    return {
      id: act.id, type: 'statute', title: act.title, title_en: act.titleEn,
      short_name: act.shortName, status: act.status, issued_date: act.issuedDate,
      in_force_date: act.inForceDate, url: act.url, description: act.description,
      provisions: [], definitions: [],
    };
  }

  // Find chapter headings in HTML using <a name="chuong_N"> or text patterns
  const chapterAnchors: { pos: number; name: string }[] = [];
  const chapterHtmlPattern = /<a\s+name="chuong_[^"]*"[^>]*>[\s\S]*?<\/a>[\s\S]*?(Ch[uư][oơ]ng\s+[IVXLCDM]+[\s\S]*?)(?=<\/[a-z])/gi;
  let chapterMatch: RegExpExecArray | null;
  while ((chapterMatch = chapterHtmlPattern.exec(html)) !== null) {
    const name = stripHtml(chapterMatch[1]).replace(/\s+/g, ' ').trim().substring(0, 200);
    if (name.length > 3) {
      chapterAnchors.push({ pos: chapterMatch.index, name });
    }
  }

  // Also detect chapters from bold text patterns in the HTML
  const chapterBoldPattern = /<b[^>]*>\s*(Ch[uư][oơ]ng\s+[IVXLCDM]+[^<]*)<\/b>/gi;
  while ((chapterMatch = chapterBoldPattern.exec(html)) !== null) {
    const name = stripHtml(chapterMatch[1]).replace(/\s+/g, ' ').trim().substring(0, 200);
    if (name.length > 3) {
      chapterAnchors.push({ pos: chapterMatch.index, name });
    }
  }

  // Sort chapter positions
  chapterAnchors.sort((a, b) => a.pos - b.pos);

  // Deduplicate anchors: keep the LAST occurrence of each dieu_N
  // (first occurrence is usually the TOC, last occurrence is the actual article)
  const lastOccurrence = new Map<string, number>();
  for (let i = 0; i < anchors.length; i++) {
    lastOccurrence.set(anchors[i].num, i);
  }

  // Collect unique anchors in order (using last occurrence indices)
  const uniqueIndices = Array.from(lastOccurrence.values()).sort((a, b) => a - b);
  const uniqueAnchors = uniqueIndices.map(i => anchors[i]);

  // Track seen article numbers for final dedup
  const seenArticles = new Map<string, number>();

  for (let i = 0; i < uniqueAnchors.length; i++) {
    const anchor = uniqueAnchors[i];
    const nextAnchor = i + 1 < uniqueAnchors.length ? uniqueAnchors[i + 1] : null;

    // Extract HTML between this anchor and the next
    const startIdx = anchor.index;
    const endIdx = nextAnchor ? nextAnchor.index : Math.min(startIdx + 50000, html.length);
    const segment = html.substring(startIdx, endIdx);

    // Convert segment to plain text
    const plainSegment = stripHtml(segment);

    // Skip very short segments (likely just a cross-reference in TOC)
    if (plainSegment.length < 20) continue;

    const articleNum = anchor.num;
    const provisionRef = `dieu${articleNum}`;

    // Extract title: look for "Điều N. Title" pattern in the segment
    const titleMatch = plainSegment.match(/Đi[eề]u\s+\d+[a-zA-Z]?\s*\.\s*(.+?)(?:\n|$)/);
    let title: string;
    let content: string;

    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
      // Content starts from "Điều N. Title\n..."
      const afterTitle = plainSegment.substring(titleMatch.index! + titleMatch[0].length).trim();
      content = (titleMatch[0].trim() + '\n' + afterTitle).trim();
    } else {
      // No clear title pattern, use first line
      const firstNewline = plainSegment.indexOf('\n');
      if (firstNewline > 0 && firstNewline < 300) {
        title = plainSegment.substring(0, firstNewline).trim();
        content = plainSegment.trim();
      } else {
        title = plainSegment.substring(0, Math.min(120, plainSegment.length)).trim();
        if (title.length < plainSegment.length) title += '...';
        content = plainSegment.trim();
      }
    }

    // Clean title: remove "Điều N." prefix from title if present
    title = title.replace(/^Đi[eề]u\s+\d+[a-zA-Z]?\s*\.\s*/, '').trim();
    if (!title) title = `Điều ${articleNum}`;

    // Skip if content is too short
    if (content.length < 15) continue;

    // Determine current chapter
    let currentChapter: string | undefined;
    for (const ch of chapterAnchors) {
      if (ch.pos < startIdx) {
        currentChapter = ch.name;
      }
    }

    // Deduplicate: keep version with more content
    const existingIdx = seenArticles.get(articleNum);
    if (existingIdx !== undefined) {
      if (content.length > provisions[existingIdx].content.length) {
        provisions[existingIdx] = {
          provision_ref: provisionRef,
          chapter: currentChapter,
          section: articleNum,
          title,
          content: content.substring(0, 12000),
        };
      }
      continue;
    }

    seenArticles.set(articleNum, provisions.length);
    provisions.push({
      provision_ref: provisionRef,
      chapter: currentChapter,
      section: articleNum,
      title,
      content: content.substring(0, 12000),
    });

    // Extract definitions from interpretation articles
    if (
      title.toLowerCase().includes('giải thích') ||
      title.toLowerCase().includes('từ ngữ') ||
      title.toLowerCase().includes('interpretation') ||
      title.toLowerCase().includes('definition')
    ) {
      extractDefinitions(content, provisionRef, definitions);
    }
  }

  return {
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
    provisions,
    definitions,
  };
}

/**
 * Fallback parser: extract articles using text-based "Điều N." pattern.
 * Used when HTML does not contain <a name="dieu_N"> anchors.
 */
function parseByTextPatterns(html: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  const plainText = stripHtml(html);

  let currentChapter: string | undefined;

  // Match "Điều N." anywhere in the text
  const articlePattern = /(?:^|[\n.;)\]])[\s]*Đi[eề]u\s+(\d+[a-zA-Z]?)\s*\.\s*/g;
  const articleStarts: { num: string; index: number; matchEnd: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = articlePattern.exec(plainText)) !== null) {
    articleStarts.push({
      num: match[1],
      index: match.index,
      matchEnd: match.index + match[0].length,
    });
  }

  // Chapter headings
  const chapterPattern = /(?:^|[\n.])[\s]*(Ch[uư][oơ]ng\s+[IVXLCDM]+[^\n.]*)/gi;
  const chapterPositions: { pos: number; name: string }[] = [];
  let chapterMatch: RegExpExecArray | null;

  while ((chapterMatch = chapterPattern.exec(plainText)) !== null) {
    const chapterName = chapterMatch[1].replace(/\s+/g, ' ').trim();
    chapterPositions.push({ pos: chapterMatch.index, name: chapterName });
  }

  const seenArticles = new Map<string, number>();

  for (let i = 0; i < articleStarts.length; i++) {
    const artStart = articleStarts[i];
    const artEnd = i + 1 < articleStarts.length
      ? articleStarts[i + 1].index
      : plainText.length;

    for (const cp of chapterPositions) {
      if (cp.pos < artStart.index) {
        currentChapter = cp.name;
      }
    }

    const articleNum = artStart.num;
    const provisionRef = `dieu${articleNum}`;
    const rawContent = plainText.substring(artStart.matchEnd, artEnd).trim();

    if (rawContent.length < 15) continue;

    const firstNewline = rawContent.indexOf('\n');
    let title: string;
    let content: string;

    if (firstNewline > 0 && firstNewline < 200) {
      title = rawContent.substring(0, firstNewline).trim();
      content = rawContent.trim();
    } else {
      const firstSentenceEnd = rawContent.search(/[.;]\s/);
      if (firstSentenceEnd > 0 && firstSentenceEnd < 200) {
        title = rawContent.substring(0, firstSentenceEnd + 1).trim();
      } else {
        title = rawContent.substring(0, Math.min(120, rawContent.length)).trim();
        if (title.length < rawContent.length) title += '...';
      }
      content = rawContent.trim();
    }

    if (content.length > 10) {
      const existingIdx = seenArticles.get(articleNum);
      if (existingIdx !== undefined) {
        if (content.length > provisions[existingIdx].content.length) {
          provisions[existingIdx] = {
            provision_ref: provisionRef,
            chapter: currentChapter,
            section: articleNum,
            title,
            content: content.substring(0, 12000),
          };
        }
        continue;
      }

      seenArticles.set(articleNum, provisions.length);
      provisions.push({
        provision_ref: provisionRef,
        chapter: currentChapter,
        section: articleNum,
        title,
        content: content.substring(0, 12000),
      });
    }

    if (
      title.toLowerCase().includes('giải thích') ||
      title.toLowerCase().includes('từ ngữ') ||
      title.toLowerCase().includes('interpretation') ||
      title.toLowerCase().includes('definition')
    ) {
      extractDefinitions(content, provisionRef, definitions);
    }
  }

  return {
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
    provisions,
    definitions,
  };
}

/**
 * Extract term definitions from an interpretation/definition article.
 */
function extractDefinitions(
  content: string,
  sourceProvision: string,
  definitions: ParsedDefinition[],
): void {
  const defPattern = /(\d+)\s*\.\s+(.+?)\s+(?:là|bao gồm|có nghĩa là)\s+(.+?)(?=\d+\s*\.\s+\S|\s*$)/g;
  let defMatch: RegExpExecArray | null;

  while ((defMatch = defPattern.exec(content)) !== null) {
    const term = defMatch[2].replace(/\s+/g, ' ').trim();
    const definition = defMatch[3].replace(/\s+/g, ' ').trim();

    if (term.length > 0 && term.length < 200 && definition.length > 5) {
      definitions.push({
        term,
        definition: definition.substring(0, 4000),
        source_provision: sourceProvision,
      });
    }
  }
}

/**
 * Pre-configured list of key Vietnamese legislation to ingest.
 * Used as fallback when census.json is not available.
 */
export const KEY_VIETNAMESE_ACTS: ActIndexEntry[] = [
  {
    id: 'cybersecurity-law-2018',
    title: 'Luật An ninh mạng 2018',
    titleEn: 'Cybersecurity Law 2018',
    shortName: 'Luật ANMT 2018',
    status: 'in_force',
    issuedDate: '2018-06-12',
    inForceDate: '2019-01-01',
    url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-An-ninh-mang-2018-351416.aspx',
    officialNumber: '24/2018/QH14',
    description: 'Comprehensive cybersecurity law.',
  },
  {
    id: 'personal-data-protection-decree-2023',
    title: 'Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân',
    titleEn: 'Personal Data Protection Decree 2023',
    shortName: 'Decree 13/2023',
    status: 'in_force',
    issuedDate: '2023-04-17',
    inForceDate: '2023-07-01',
    url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Nghi-dinh-13-2023-ND-CP-bao-ve-du-lieu-ca-nhan-559733.aspx',
    officialNumber: '13/2023/NĐ-CP',
    description: 'Vietnam\'s primary PDP regulation.',
  },
  {
    id: 'constitution-2013',
    title: 'Hiến pháp 2013',
    titleEn: 'Constitution of the Socialist Republic of Vietnam 2013',
    shortName: 'Hiến pháp 2013',
    status: 'in_force',
    issuedDate: '2013-11-28',
    inForceDate: '2014-01-01',
    url: 'https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Hien-phap-nam-2013-215627.aspx',
    officialNumber: 'N/A',
    description: 'Supreme law of Vietnam.',
  },
  {
    id: 'penal-code-2015',
    title: 'Bộ luật Hình sự 2015',
    titleEn: 'Penal Code 2015',
    shortName: 'BLHS 2015',
    status: 'amended',
    issuedDate: '2015-11-27',
    inForceDate: '2018-01-01',
    url: 'https://thuvienphapluat.vn/van-ban/Trach-nhiem-hinh-su/Bo-luat-hinh-su-2015-296661.aspx',
    officialNumber: '100/2015/QH13',
    description: 'Penal code with cybercrime provisions.',
  },
  {
    id: 'enterprise-law-2020',
    title: 'Luật Doanh nghiệp 2020',
    titleEn: 'Enterprise Law 2020',
    shortName: 'Luật DN 2020',
    status: 'in_force',
    issuedDate: '2020-06-17',
    inForceDate: '2021-01-01',
    url: 'https://thuvienphapluat.vn/van-ban/Doanh-nghiep/Luat-Doanh-nghiep-2020-so-59-2020-QH14-437468.aspx',
    officialNumber: '59/2020/QH14',
    description: 'Enterprise/company law.',
  },
];
