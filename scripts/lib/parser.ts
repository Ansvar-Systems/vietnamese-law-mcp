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
 * Thu Vien Phap Luat serves legislation as HTML pages with a consistent structure.
 * Articles are marked with "Điều N." followed by the article title and content.
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
 * Converts block-level tags to newlines and inline tags to spaces.
 */
function stripHtml(html: string): string {
  return html
    // Convert block-level elements to newlines for paragraph separation
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
 * Vietnamese statutes are structured with "Điều N." markers for each article.
 * We split the text on these markers and extract the article number, title,
 * and content. Chapter headings ("Chương ...") are tracked for context.
 *
 * This parser handles both thuvienphapluat.vn and vanban.chinhphu.vn HTML.
 * On thuvienphapluat.vn, article markers may appear inline (not on new lines)
 * because the HTML structure uses spans/divs that collapse to inline text.
 * We therefore match "Điều N." regardless of position, not just at line starts.
 */
export function parseVietnameseHtml(html: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // First, extract the main content area and convert to text.
  // thuvienphapluat.vn wraps content in various divs; we strip tags and
  // work with the plain text to reliably detect "Điều N." patterns.
  const plainText = stripHtml(html);

  // Track current chapter as we parse through articles sequentially
  let currentChapter: string | undefined;

  // Match "Điều N." anywhere in the text. Vietnamese uses "Điều" (with diacritics).
  // The number may include letters for amendments (e.g., "Điều 26a").
  // Title follows on the same line after the period.
  //
  // Pattern matches: "Điều 1.", "Điều 23.", "Điều 100a." etc.
  // We use a word boundary or punctuation before "Điều" to avoid matching
  // mid-word occurrences, but don't require newline since thuvienphapluat.vn
  // often renders articles inline after stripping HTML tags.
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

  // Also scan for chapter headings to track context.
  // Pattern: "Chương I", "Chương II", "CHƯƠNG I" etc.
  const chapterPattern = /(?:^|[\n.])[\s]*(Ch[uư][oơ]ng\s+[IVXLCDM]+[^\n.]*)/gi;
  const chapterPositions: { pos: number; name: string }[] = [];
  let chapterMatch: RegExpExecArray | null;

  while ((chapterMatch = chapterPattern.exec(plainText)) !== null) {
    const chapterName = chapterMatch[1].replace(/\s+/g, ' ').trim();
    chapterPositions.push({ pos: chapterMatch.index, name: chapterName });
  }

  // Deduplicate articles by number (keep the first occurrence that has substantial content)
  const seenArticles = new Map<string, number>(); // articleNum -> index in provisions

  for (let i = 0; i < articleStarts.length; i++) {
    const artStart = articleStarts[i];
    const artEnd = i + 1 < articleStarts.length
      ? articleStarts[i + 1].index
      : plainText.length;

    // Update current chapter based on position
    for (const cp of chapterPositions) {
      if (cp.pos < artStart.index) {
        currentChapter = cp.name;
      }
    }

    const articleNum = artStart.num;
    const provisionRef = `dieu${articleNum}`;

    // Extract the content between this article marker and the next
    const rawContent = plainText.substring(artStart.matchEnd, artEnd).trim();

    // Skip very short content (likely a cross-reference, not an actual article)
    if (rawContent.length < 15) continue;

    // The title is typically the first line (up to the first newline)
    const firstNewline = rawContent.indexOf('\n');
    let title: string;
    let content: string;

    if (firstNewline > 0 && firstNewline < 200) {
      title = rawContent.substring(0, firstNewline).trim();
      content = rawContent.trim();
    } else {
      // No clear line break - use first sentence or first 120 chars as title
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
      // Deduplicate: keep the longer content version
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
        content: content.substring(0, 12000), // Cap at 12K chars
      });
    }

    // Extract definitions from interpretation articles (typically Điều 2 or Điều 3)
    // Vietnamese definitions use pattern: "N. Term là/means ..."
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
 *
 * Vietnamese definitions typically appear as numbered clauses:
 *   1. Term là definition text.
 *   2. Another term là definition text.
 *
 * "là" means "is/means" in Vietnamese.
 *
 * On thuvienphapluat.vn, content is often inline without newlines between
 * numbered items, so we match "N. Term là ..." followed by "N+1." or end.
 */
function extractDefinitions(
  content: string,
  sourceProvision: string,
  definitions: ParsedDefinition[],
): void {
  // Match numbered definition entries: "N. Term là ..."
  // Content may be inline (no newlines) so we match from one numbered item to the next.
  // Pattern: digit(s) + "." + term text + "là/bao gồm/có nghĩa là" + definition text
  // Terminated by the next numbered definition or end of string.
  const defPattern = /(\d+)\s*\.\s+(.+?)\s+(?:là|bao gồm|có nghĩa là)\s+(.+?)(?=\d+\s*\.\s+\S|\s*$)/g;
  let defMatch: RegExpExecArray | null;

  while ((defMatch = defPattern.exec(content)) !== null) {
    const term = defMatch[2].replace(/\s+/g, ' ').trim();
    const definition = defMatch[3].replace(/\s+/g, ' ').trim();

    // Validate: term should be reasonable length, definition should be substantial
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
 *
 * Source: Thu Vien Phap Luat (thuvienphapluat.vn)
 * URLs follow: https://thuvienphapluat.vn/van-ban/{Category}/{Slug}.aspx
 *
 * These are the most important laws and decrees for cybersecurity, data protection,
 * information technology, and compliance use cases in Vietnam.
 *
 * Vietnamese legislation numbering:
 *   - Laws: No. XX/YYYY/QHZZ (e.g., 24/2018/QH14 = Law No. 24, Year 2018, 14th National Assembly)
 *   - Decrees: No. XX/YYYY/ND-CP (e.g., 13/2023/ND-CP = Decree No. 13, Year 2023, Government)
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
    description: 'Comprehensive cybersecurity law establishing data localization requirements, critical information system protection, and cybersecurity incident response obligations. Administered by Ministry of Public Security.',
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
    description: 'Vietnam\'s primary personal data protection regulation. Establishes data subject rights, consent requirements, cross-border data transfer rules, data controller and processor obligations, and impact assessment requirements.',
  },
  {
    id: 'information-technology-law-2006',
    title: 'Luật Công nghệ thông tin 2006',
    titleEn: 'Law on Information Technology 2006',
    shortName: 'Luật CNTT 2006',
    status: 'in_force',
    issuedDate: '2006-06-29',
    inForceDate: '2007-01-01',
    url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-Cong-nghe-thong-tin-2006-67-2006-QH11-12987.aspx',
    officialNumber: '67/2006/QH11',
    description: 'Foundational IT law regulating IT applications, IT industry development, digital content, electronic communications, and information security measures.',
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
    description: 'Comprehensive enterprise/company law governing establishment, organization, restructuring, and dissolution of enterprises. Includes corporate governance and shareholder rights.',
  },
  {
    id: 'e-transactions-law-2023',
    title: 'Luật Giao dịch điện tử 2023',
    titleEn: 'Law on E-Transactions 2023',
    shortName: 'Luật GDDT 2023',
    status: 'in_force',
    issuedDate: '2023-06-22',
    inForceDate: '2024-07-01',
    url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-Giao-dich-dien-tu-2023-20-2023-QH15-567171.aspx',
    officialNumber: '20/2023/QH15',
    description: 'Modernized e-transactions law replacing the 2005 version. Governs electronic signatures, digital certificates, electronic contracts, and trust services. Recognizes blockchain and distributed ledger technology.',
  },
  {
    id: 'consumer-rights-protection-law-2023',
    title: 'Luật Bảo vệ quyền lợi người tiêu dùng 2023',
    titleEn: 'Law on Protection of Consumer Rights 2023',
    shortName: 'Luật BVQLNTD 2023',
    status: 'in_force',
    issuedDate: '2023-06-20',
    inForceDate: '2024-07-01',
    url: 'https://thuvienphapluat.vn/van-ban/Thuong-mai/Luat-Bao-ve-quyen-loi-nguoi-tieu-dung-2023-19-2023-QH15-567169.aspx',
    officialNumber: '19/2023/QH15',
    description: 'Updated consumer protection law replacing the 2010 version. Strengthens consumer rights in e-commerce transactions, data protection obligations for businesses, and dispute resolution mechanisms.',
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
    description: 'Supreme law of Vietnam. Article 21 guarantees the right to privacy of personal life, family secrets, and correspondence. Article 25 guarantees freedom of speech, press, and access to information.',
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
    description: 'Criminal code with cybercrime provisions. Articles 285-294 cover computer crimes including unauthorized access, malware distribution, illegal data collection, and online fraud. Amended by Law 12/2017/QH14.',
  },
  {
    id: 'telecommunications-law-2009',
    title: 'Luật Viễn thông 2009',
    titleEn: 'Law on Telecommunications 2009',
    shortName: 'Luật VT 2009',
    status: 'in_force',
    issuedDate: '2009-11-23',
    inForceDate: '2010-07-01',
    url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-vien-thong-2009-41-2009-QH12-98328.aspx',
    officialNumber: '41/2009/QH12',
    description: 'Telecommunications regulation governing network infrastructure, licensing, interconnection, spectrum management, and subscriber data protection. Administered by Ministry of Information and Communications.',
  },
  {
    id: 'competition-law-2018',
    title: 'Luật Cạnh tranh 2018',
    titleEn: 'Law on Competition 2018',
    shortName: 'Luật CT 2018',
    status: 'in_force',
    issuedDate: '2018-06-12',
    inForceDate: '2019-07-01',
    url: 'https://thuvienphapluat.vn/van-ban/Thuong-mai/Luat-canh-tranh-2018-23-2018-QH14-353991.aspx',
    officialNumber: '23/2018/QH14',
    description: 'Competition and antitrust law regulating anti-competitive agreements, abuse of dominant market position, economic concentrations (mergers), and unfair competitive practices. Replaces the 2004 Competition Law.',
  },
];
