# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-XX-XX
### Added
- Initial release of Vietnamese Law MCP
- `search_legislation` tool for full-text search across all Vietnamese statutes and decrees
- `get_provision` tool for retrieving specific articles (dieu)
- `get_provision_eu_basis` tool for international framework cross-references (GDPR, ASEAN)
- `validate_citation` tool for legal citation validation
- `check_statute_currency` tool for checking statute amendment status
- `list_laws` tool for browsing available legislation
- Coverage of Cybersecurity Law 2018, Decree 13/2023 (PDP), Law on IT 2006, Enterprise Law 2020, Law on E-Transactions 2023, Consumer Rights Protection 2023
- Vietnamese and English language support
- Contract tests with 12 golden test cases
- Drift detection with 6 stable provision anchors
- Health and version endpoints
- Vercel deployment (single tier bundled)
- npm package with stdio transport
- MCP Registry publishing

[Unreleased]: https://github.com/Ansvar-Systems/vietnamese-law-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Ansvar-Systems/vietnamese-law-mcp/releases/tag/v1.0.0
