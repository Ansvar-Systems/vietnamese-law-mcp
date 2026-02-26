# Vietnamese Law MCP Server

**The thuvienphapluat.vn alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fvietnamese-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/vietnamese-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/Ansvar-Systems/vietnamese-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/vietnamese-law-mcp/actions/workflows/ci.yml)
[![Provisions](https://img.shields.io/badge/provisions-3%2C226-blue)]()

Query **93 Vietnamese laws** -- from the Cybersecurity Law and Personal Data Protection to the Civil Code, Penal Code, and Enterprise Law -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Vietnamese legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu)

---

## Why This Exists

Vietnamese legal research is scattered across thuvienphapluat.vn, vbpl.vn, vanban.chinhphu.vn, and luatvietnam.vn. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking cybersecurity or data protection requirements
- A **legal tech developer** building tools on Vietnamese law
- A **business** navigating enterprise law, investment, or tax regulations

...you shouldn't need to navigate multiple portals in Vietnamese. Ask Claude. Get the exact provision. With context.

This MCP server makes Vietnamese law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://vietnamese-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add vietnamese-law --transport http https://vietnamese-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vietnamese-law": {
      "type": "url",
      "url": "https://vietnamese-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "vietnamese-law": {
      "type": "http",
      "url": "https://vietnamese-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/vietnamese-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vietnamese-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/vietnamese-law-mcp"]
    }
  }
}
```

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Laws** | 93 documents | Constitution, 6 Codes, 85 Laws, 1 key Decree |
| **Provisions** | 3,226 articles | Full-text searchable with FTS5 (unicode61 tokenizer) |
| **Definitions** | 104 terms | Extracted from interpretation articles |
| **Database Size** | ~14 MB | Optimized SQLite, portable |

### Coverage by Category

| Category | Key Laws | Articles |
|----------|----------|----------|
| **Constitution** | Hien phap 2013 | 120 |
| **Civil Law** | Civil Code 2015 (689 arts), Civil Procedure Code 2015 (511 arts) | 1,196 |
| **Criminal Law** | Penal Code 2015 (287 arts incl. cybercrime), Criminal Procedure Code 2015 (503 arts) | 790 |
| **Cybersecurity & ICT** | Cybersecurity Law 2018, Network Security 2015, IT Law 2006, E-Transactions 2023, Data Law 2024, PDP Law 2025 | 238 |
| **Labour** | Labour Code 2019 (220 arts), Employment 2013, Occupational Safety 2015 | 249 |
| **Commerce & Enterprise** | Enterprise Law 2020, Investment 2020, Competition 2018, Consumer Rights 2023, Securities 2019 | 69 |
| **Finance & Tax** | Tax Administration 2019, VAT 2024, CIT 2008, PIT 2007, AML 2022, Credit Institutions 2024 | 30 |
| **Land & Construction** | Land Law 2024, Housing 2023, Construction 2014, Real Estate 2023 | 162 |
| **Other** | Anti-Corruption, IP Law, Press Law, Education, Transport, Defence, and 30+ more | 491 |

**Verified data only** -- all text is sourced from official thuvienphapluat.vn and vbpl.vn databases. Zero LLM-generated content.

---

## Example Queries

Once connected, just ask naturally:

- *"What does Article 26 of the Cybersecurity Law say about data localization?"*
- *"What are the cybercrime penalties in Vietnam's Penal Code?"*
- *"Search for provisions about 'du lieu ca nhan' (personal data)"*
- *"What consumer data protection obligations exist under Vietnamese law?"*
- *"What does Article 21 of the Constitution guarantee regarding privacy?"*
- *"Find provisions about electronic signatures in the E-Transactions Law"*
- *"What are the requirements for enterprise registration under the Enterprise Law?"*

---

## Available Tools

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on 3,226 provisions with BM25 ranking (Vietnamese + English) |
| `get_provision` | Retrieve specific article by law ID + article number |
| `build_legal_stance` | Aggregate citations from multiple laws |
| `format_citation` | Format citations per Vietnamese conventions |
| `check_currency` | Check if law is in force, amended, or repealed |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `get_eu_basis` | Get EU/international framework references |
| `get_provision_eu_basis` | Get EU law references for specific provision |

---

## Regulatory Context

- **Legal system:** Civil law with socialist legal traditions (French and Soviet influences)
- **Cybersecurity authority:** Ministry of Public Security (MPS)
- **IT/Telecoms regulator:** Ministry of Information and Communications (MIC)
- **Data protection:** Decree 13/2023/ND-CP is the current primary PDP regulation; standalone Law on Personal Data Protection (No. 91/2025/QH15) takes effect 2026-01-01
- **Data localization:** Cybersecurity Law 2018 requires storage of Vietnamese user data in Vietnam
- **Cross-border transfers:** Impact assessment + government registration required
- **Language:** Vietnamese (tieng Viet) is the legally binding language; English translations are unofficial
- **ASEAN member:** Participates in ASEAN Framework on Digital Data Governance
- **Legislation numbering:** Type + Number/Year/Issuing body (e.g., 24/2018/QH14 = Law 24, 2018, 14th National Assembly)

---

## Data Sources & Freshness

| Source | Authority | Method | License |
|--------|-----------|--------|---------|
| [Thu Vien Phap Luat](https://thuvienphapluat.vn) | LawNet | HTML scrape | Open Access |
| [VBPL](https://vbpl.vn) | Ministry of Justice | Cross-reference | Government Open Data |

> Full provenance metadata: [`sources.yml`](./sources.yml)

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/vietnamese-law-mcp
cd vietnamese-law-mcp
npm install
npm run build
npm test
```

### Data Pipeline

```bash
npm run census                        # Generate full law census (data/census.json)
npm run ingest                        # Fetch + parse all laws from census
npm run ingest -- --resume            # Resume interrupted ingestion
npm run ingest -- --limit 5           # Test with 5 laws
npm run ingest -- --skip-fetch        # Reparse cached HTML
npm run build:db                      # Build SQLite database from seeds
npm run check-updates                 # Check for legislative changes
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Contract Tests

12 golden contract tests covering:
- 5 article retrieval tests (Constitution Art 21, Cybersecurity Art 1, Penal Code Art 285, Civil Code Art 1, PDP Decree Art 1)
- 3 search tests (du lieu ca nhan, an ninh mang, doanh nghiep)
- 1 citation roundtrip test (thuvienphapluat.vn URL)
- 1 cross-reference test (Labour Code Art 1)
- 2 negative tests (non-existent law, malformed article)

```bash
npm run test:contract
```

---

## Vietnamese Legislation Numbering

| Format | Example | Meaning |
|--------|---------|---------|
| Law (Luat) | 24/2018/QH14 | Law No. 24, Year 2018, 14th National Assembly |
| Decree (Nghi dinh) | 13/2023/ND-CP | Decree No. 13, Year 2023, Government |
| Circular (Thong tu) | XX/YYYY/TT-BCA | Circular from Ministry of Public Security |
| Decision (Quyet dinh) | XX/YYYY/QD-TTg | Decision of the Prime Minister |
| Code (Bo luat) | 91/2015/QH13 | Civil Code No. 91, Year 2015, 13th National Assembly |

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Text is sourced from official Vietnamese legal databases. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Vietnamese is the legally binding language**; English content is unofficial
> - **Verify critical citations** against primary sources for court filings
> - Some laws with newer URL patterns have metadata only (no article text)

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

---

## Related Projects: Complete Compliance Suite

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations** -- GDPR, AI Act, DORA, NIS2, and more. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/Security-Controls-MCP)
**Query 261 security frameworks and 1,451 SCF controls.** `npx @ansvar/security-controls-mcp`

---

## Security

See [SECURITY.md](SECURITY.md) for vulnerability disclosure policy.

Report data errors: [Open an issue](https://github.com/Ansvar-Systems/vietnamese-law-mcp/issues/new?template=data-error.md)

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Vietnamese legislation:** Government work product (public domain under Vietnamese law)
- **thuvienphapluat.vn:** Open Access legal database
- **vbpl.vn:** Government Open Data (Ministry of Justice)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools. This MCP server makes Vietnamese law searchable and AI-readable -- because navigating 93 laws across multiple Vietnamese-language portals shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)**

---

<p align="center">
  <sub>Built with care by Ansvar Systems</sub>
</p>
