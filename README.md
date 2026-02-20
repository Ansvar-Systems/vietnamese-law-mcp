# Vietnamese Law MCP

[![npm](https://img.shields.io/npm/v/@ansvar/vietnamese-law-mcp)](https://www.npmjs.com/package/@ansvar/vietnamese-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/vietnamese-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/vietnamese-law-mcp/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-green)](https://registry.modelcontextprotocol.io/)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/Ansvar-Systems/vietnamese-law-mcp)](https://securityscorecards.dev/viewer/?uri=github.com/Ansvar-Systems/vietnamese-law-mcp)

A Model Context Protocol (MCP) server providing comprehensive access to Vietnamese legislation, including the Cybersecurity Law 2018, Personal Data Protection Decree 2023, Law on Information Technology 2006, Enterprise Law 2020, Law on E-Transactions 2023, and Law on Protection of Consumer Rights 2023 with full-text search.

## Deployment Tier

**SMALL** -- Single tier, bundled SQLite database shipped with the npm package.

**Estimated database size:** ~60-130 MB (full corpus of Vietnamese national legislation with selected English translations)

## Key Legislation Covered

| Law | Number | Year | Significance |
|-----|--------|------|-------------|
| **Cybersecurity Law** | No. 24/2018/QH14 | 2018 | Data localization requirements, cybersecurity framework, content regulation |
| **Personal Data Protection Decree** | Decree 13/2023/ND-CP | 2023 | Vietnam's primary PDP regulation (decree, not standalone law); GDPR-influenced |
| **Law on Information Technology** | No. 67/2006/QH11 | 2006 | IT activities, electronic government, digital development |
| **Enterprise Law** | No. 59/2020/QH14 | 2020 | Establishment, organization, and operation of enterprises |
| **Law on E-Transactions** | No. 20/2023/QH15 | 2023 | Electronic transactions, digital signatures, trust services (replaces 2005 version) |
| **Law on Protection of Consumer Rights** | 2023 | 2023 | Consumer protection in e-commerce, unfair practices (replaces 2010 version) |
| **2013 Constitution** | - | 2013 | Supreme law; Article 21 recognizes right to privacy |

## Regulatory Context

- **Cybersecurity Authority:** Ministry of Public Security (MPS) -- primary authority for cybersecurity enforcement
- **IT/Telecoms Regulator:** Ministry of Information and Communications (MIC)
- **Vietnam does NOT have a standalone comprehensive data protection law;** Decree 13/2023/ND-CP is the primary personal data protection regulation issued as a government decree
- The Cybersecurity Law 2018 includes **data localization requirements** for domestic and foreign service providers operating in Vietnam
- **Cross-border data transfer restrictions** under the Cybersecurity Law and Decree 13/2023 require impact assessments and government registration
- Vietnamese (tieng Viet) is the legally binding language; English translations are unofficial
- Vietnam uses a civil law system based on socialist legal traditions with French and Soviet influences
- Vietnam is an ASEAN member and participates in ASEAN digital governance frameworks
- Vietnamese legislation numbering includes type, number, year, and issuing body (e.g., 24/2018/QH14)

## Data Sources

| Source | Authority | Method | Update Frequency | License | Coverage |
|--------|-----------|--------|-----------------|---------|----------|
| [Thu Vien Phap Luat (thuvienphapluat.vn)](https://thuvienphapluat.vn) | LawNet | HTML Scrape | Weekly | Open Access | Laws, Decrees, Circulars, English translations |
| [Official Gazette (vanban.chinhphu.vn)](https://vanban.chinhphu.vn) | Government of Vietnam | HTML Scrape | Weekly | Government Open Data | Official text of Laws, Decrees, Decisions, Circulars |

> Full provenance metadata: [`sources.yml`](./sources.yml)

## Installation

```bash
npm install -g @ansvar/vietnamese-law-mcp
```

## Usage

### As stdio MCP server

```bash
vietnamese-law-mcp
```

### In Claude Desktop / MCP client configuration

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

## Available Tools

| Tool | Description |
|------|-------------|
| `get_provision` | Retrieve a specific article (dieu) from a Vietnamese law or decree |
| `search_legislation` | Full-text search across all Vietnamese legislation in Vietnamese and English |
| `get_provision_eu_basis` | Cross-reference lookup for international framework relationships (GDPR, ASEAN, etc.) |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run contract tests
npm run test:contract

# Run all validation
npm run validate

# Build database from sources
npm run build:db

# Start server
npm start
```

## Contract Tests

This MCP includes 12 golden contract tests covering:
- 4 article retrieval tests (Cybersecurity Law Art 2, Decree 13/2023 Art 2, Enterprise Law Art 1, E-Transactions Law Art 1)
- 3 search tests (du lieu ca nhan, an ninh mang, giao dich dien tu)
- 2 citation roundtrip tests (official thuvienphapluat.vn/vanban.chinhphu.vn URL patterns)
- 1 cross-reference test (Decree 13/2023 to GDPR)
- 2 negative tests (non-existent law, malformed article)

Run with: `npm run test:contract`

## Vietnamese Legislation Numbering

Vietnam uses a specific numbering format that includes the document type, number, year, and issuing body:

| Format | Example | Meaning |
|--------|---------|---------|
| Law (Luat) | No. 24/2018/QH14 | Law No. 24, Year 2018, 14th National Assembly |
| Decree (Nghi dinh) | 13/2023/ND-CP | Decree No. 13, Year 2023, Government (Chinh Phu) |
| Circular (Thong tu) | XX/YYYY/TT-BCA | Circular from Ministry of Public Security |
| Decision (Quyet dinh) | XX/YYYY/QD-TTg | Decision of the Prime Minister |

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability disclosure policy.

Report data errors: [Open an issue](https://github.com/Ansvar-Systems/vietnamese-law-mcp/issues/new?template=data-error.md)

## License

Apache-2.0 -- see [LICENSE](./LICENSE)

---

Built by [Ansvar Systems](https://ansvar.eu) -- Cybersecurity compliance through AI-powered analysis.
