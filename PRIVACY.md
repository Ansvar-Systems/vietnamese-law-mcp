# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Vietnamese bar association rules and data protection law.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Vietnamese bar rules (Vietnam Bar Federation / Liên đoàn Luật sư Việt Nam) require strict confidentiality under the Law on Lawyers

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/vietnamese-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/vietnamese-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://vietnamese-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text, provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Vietnam)

### Vietnam Bar Federation Rules

Vietnamese lawyers (luật sư) are bound by strict confidentiality rules under the Law on Lawyers (Luật Luật sư, Law No. 65/2006/QH11, as amended), the Code of Professional Ethics and Conduct of Vietnamese Lawyers, and relevant provisions of the Civil Code and Penal Code.

#### Bí mật nghề nghiệp (Professional Secrecy)

- All client communications are privileged under the duty of professional secrecy
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of professional secrecy may result in disciplinary sanctions and legal liability

### Data Protection Compliance

Under **Decree 13/2023/ND-CP on Personal Data Protection** and the **Law on Cybersecurity (2018)**, when using services that process client data:

- You are the **Data Controller** (Bên kiểm soát dữ liệu cá nhân)
- AI service providers (Anthropic, Vercel) may be **Data Processors** (Bên xử lý dữ liệu cá nhân)
- A **Data Processing Agreement** may be required
- Cross-border data transfers require an impact assessment and consent under Decree 13/2023
- The Ministry of Public Security oversees personal data protection enforcement
- Ensure adequate technical and organizational measures are in place

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does the Law on Enterprises say about shareholder rights?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for tax evasion under the Penal Code?"
```

- Query pattern may reveal you are working on a tax evasion matter
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases (LuatVietnam Premium, THƯ VIỆN PHÁP LUẬT) with proper data processing agreements

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use commercial legal databases (LuatVietnam Premium, THƯ VIỆN PHÁP LUẬT)

### For Large Firms / Corporate Legal

1. Negotiate data processing agreements with AI service providers
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns
4. Ensure compliance with Decree 13/2023 cross-border transfer requirements

### For Government / Public Sector

1. Use self-hosted deployment, no external APIs
2. Follow Vietnamese government information security requirements and Law on Cybersecurity
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/vietnamese-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **Vietnam Bar Guidance**: Consult Liên đoàn Luật sư Việt Nam or your local Đoàn Luật sư ethics guidance
- **Data Protection Authority**: Ministry of Public Security, Department of Cybersecurity and Hi-tech Crime Prevention

---

**Last Updated**: 2026-02-22
**Tool Version**: 1.0.0
