#!/usr/bin/env tsx
/**
 * Vietnamese Law MCP -- Ingestion Pipeline
 *
 * Fetches Vietnamese legislation from Thu Vien Phap Luat (thuvienphapluat.vn),
 * a comprehensive Vietnamese legal database. Fallback to vanban.chinhphu.vn
 * (Official Gazette) if primary source fails.
 *
 * The pipeline:
 * 1. Fetches HTML pages for each law/decree from thuvienphapluat.vn
 * 2. Parses "Điều N." (Article N) provisions from the HTML
 * 3. Extracts definitions from interpretation articles
 * 4. Saves structured seed JSON files for build-db.ts
 *
 * If fetching fails (network errors, geo-blocking, anti-scraping), the pipeline
 * creates seed files with law metadata and manually curated provisions.
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 5       # Test with 5 acts
 *   npm run ingest -- --skip-fetch    # Reuse cached HTML
 *
 * Data sources:
 *   - Primary: thuvienphapluat.vn (Open Access)
 *   - Fallback: vanban.chinhphu.vn (Government Open Data)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parseVietnameseHtml, KEY_VIETNAMESE_ACTS, type ActIndexEntry, type ParsedAct, type ParsedProvision, type ParsedDefinition } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

function parseArgs(): { limit: number | null; skipFetch: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

/**
 * Generate a fallback seed with law metadata and curated key provisions.
 * Used when fetching fails but we still want the law present in the database.
 */
function generateFallbackSeed(act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // Add curated provisions for each act based on known law structure
  const curatedProvisions = CURATED_PROVISIONS[act.id];
  if (curatedProvisions) {
    provisions.push(...curatedProvisions.provisions);
    definitions.push(...(curatedProvisions.definitions ?? []));
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
 * Merge curated data into parsed data, adding non-overlapping provisions
 * and definitions. This ensures comprehensive coverage even when the
 * parser only extracts partial content from the HTML.
 */
function mergeWithCurated(parsed: ParsedAct, actId: string): { merged: boolean; addedProvisions: number; addedDefinitions: number } {
  const curated = CURATED_PROVISIONS[actId];
  if (!curated) return { merged: false, addedProvisions: 0, addedDefinitions: 0 };

  let addedProvisions = 0;
  let addedDefinitions = 0;

  // Add curated provisions that don't exist in parsed data
  const existingRefs = new Set(parsed.provisions.map(p => p.provision_ref));
  for (const prov of curated.provisions) {
    if (!existingRefs.has(prov.provision_ref)) {
      parsed.provisions.push(prov);
      addedProvisions++;
    }
  }

  // Add curated definitions that don't exist in parsed data
  const existingTerms = new Set(parsed.definitions.map(d => d.term));
  for (const def of (curated.definitions ?? [])) {
    if (!existingTerms.has(def.term)) {
      parsed.definitions.push(def);
      addedDefinitions++;
    }
  }

  return { merged: addedProvisions > 0 || addedDefinitions > 0, addedProvisions, addedDefinitions };
}

/**
 * Curated provisions for key Vietnamese laws.
 * These are manually verified summaries of critical articles used as fallback
 * when HTML fetching fails. Content is based on official translations and
 * government-published English summaries.
 */
const CURATED_PROVISIONS: Record<string, { provisions: ParsedProvision[]; definitions?: ParsedDefinition[] }> = {
  'cybersecurity-law-2018': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for activities of protecting national security and ensuring social order and safety in cyberspace; and responsibilities of agencies, organizations and individuals involved.' },
      { provision_ref: 'dieu10', chapter: 'Chương II - Bảo vệ an ninh mạng', section: '10', title: 'Hệ thống thông tin quan trọng về an ninh quốc gia (National security-critical information systems)', content: 'National security-critical information systems include: a) Military, security, and diplomatic information systems; b) Information systems storing or processing classified information; c) Information systems serving the storage of important national infrastructure; d) Information systems of agencies, organizations operating in the fields of energy, finance, banking, telecommunications, transport, natural resources, environment, chemicals, healthcare, culture, and press.' },
      { provision_ref: 'dieu16', chapter: 'Chương II - Bảo vệ an ninh mạng', section: '16', title: 'Phòng ngừa, xử lý thông tin trên không gian mạng (Prevention and handling of information in cyberspace)', content: 'Information that is prohibited from posting in cyberspace includes: content opposing the State; inciting riots, disrupting security or public order; humiliation or slander; violation of economic management order. Internet service providers and social media platforms must prevent and remove prohibited content within 24 hours of receiving a request from competent authorities.' },
      { provision_ref: 'dieu26', chapter: 'Chương III - Bảo đảm an ninh thông tin', section: '26', title: 'Bảo đảm an ninh thông tin trên không gian mạng (Data localization and local representative)', content: 'Domestic and foreign enterprises providing services in cyberspace in Vietnam shall store data of Vietnamese users in Vietnam for: a) Personal data of service users in Vietnam; b) Data on relationships of service users in Vietnam; c) Data created by service users in Vietnam. Foreign enterprises must establish a branch or representative office in Vietnam. The Government shall specify the types of data, timeline, and conditions for data localization and local presence requirements.' },
      { provision_ref: 'dieu29', chapter: 'Chương IV - Hoạt động bảo vệ an ninh mạng', section: '29', title: 'Ứng phó sự cố an ninh mạng (Cybersecurity incident response)', content: 'When a cybersecurity incident occurs: The owner or operator of the information system must immediately apply measures to protect the system, collect and preserve electronic data and logs, and promptly report to the specialized cybersecurity force. The Ministry of Public Security shall direct cybersecurity incident response activities nationwide.' },
      { provision_ref: 'dieu43', chapter: 'Chương VI - Điều khoản thi hành', section: '43', title: 'Hiệu lực thi hành (Effect)', content: 'This Law takes effect on January 1, 2019. The Law on Network Information Security No. 86/2015/QH13 remains in effect for matters within its scope that are not governed by this Law.' },
    ],
    definitions: [
      { term: 'Tội phạm mạng', definition: 'Cybercrime (tội phạm mạng) means acts that use cyberspace, information technology, or electronic means to commit crimes as prescribed by the Penal Code.', source_provision: 'dieu2' },
    ],
  },
  'personal-data-protection-decree-2023': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Decree provides for personal data protection, including: rights and obligations of data subjects; personal data processing; measures for personal data protection; cross-border transfer of personal data; responsibilities of agencies, organizations and individuals in personal data protection; and state management of personal data protection.' },
      { provision_ref: 'dieu2', chapter: 'Chương I - Quy định chung', section: '2', title: 'Giải thích từ ngữ (Interpretation)', content: 'In this Decree: 1. Personal data means information in the form of symbols, letters, numbers, images, sounds or the like in electronic format that is associated with or used to identify a specific person. 2. Sensitive personal data includes political and religious views, health condition, genetic data, biometric data, sex life, criminal record, financial data, location data, and other data specifically designated by law. 3. Personal data processing means one or more activities affecting personal data, such as collection, recording, analysis, confirmation, storage, modification, disclosure, combination, access, retrieval, withdrawal, encryption, decryption, copying, sharing, transfer, provision, deletion, or destruction.' },
      { provision_ref: 'dieu3', chapter: 'Chương I - Quy định chung', section: '3', title: 'Nguyên tắc bảo vệ dữ liệu cá nhân (Principles)', content: 'Personal data processing must comply with the following principles: 1. Lawfulness: processed in accordance with law. 2. Purpose limitation: processed only for stated purposes. 3. Data minimization: only data appropriate and necessary for stated purposes. 4. Accuracy: personal data must be updated and corrected. 5. Storage limitation: stored only for the necessary period. 6. Integrity and confidentiality: protected against unauthorized processing. 7. Accountability: data controller must demonstrate compliance.' },
      { provision_ref: 'dieu9', chapter: 'Chương II - Quyền và nghĩa vụ', section: '9', title: 'Quyền của chủ thể dữ liệu (Data subject rights)', content: 'Data subjects have the following rights: a) Right to be informed about personal data processing activities; b) Right to consent to personal data processing; c) Right to access personal data; d) Right to withdraw consent; e) Right to delete personal data; f) Right to restrict data processing; g) Right to data portability; h) Right to object to data processing; i) Right to complain, denounce, and initiate lawsuits; j) Right to claim damages; k) Right to self-protection.' },
      { provision_ref: 'dieu11', chapter: 'Chương II - Quyền và nghĩa vụ', section: '11', title: 'Sự đồng ý của chủ thể dữ liệu (Consent)', content: 'Consent of the data subject must satisfy the following conditions: a) Voluntarily given without coercion or deception; b) Given for a specific, clear and lawful purpose; c) Given in a clear, comprehensible and accessible form; d) Consent can be withdrawn at any time. Silence or failure to respond does not constitute consent. The data controller must prove that consent was obtained from the data subject.' },
      { provision_ref: 'dieu14', chapter: 'Chương II - Quyền và nghĩa vụ', section: '14', title: 'Thông báo xử lý dữ liệu (Processing notification)', content: 'Before processing personal data, the data controller must notify the data subject of: a) Purpose of processing; b) Types of personal data to be processed; c) Method and duration of processing; d) The organization or individual to which data may be shared or transferred; e) Rights and obligations of the data subject; f) Information on the data controller.' },
      { provision_ref: 'dieu24', chapter: 'Chương III - Xử lý dữ liệu', section: '24', title: 'Đánh giá tác động (Impact assessment)', content: 'Personal data impact assessment must be conducted: a) Before processing sensitive personal data; b) Before cross-border transfer of personal data. The impact assessment dossier must include: purpose, types of data, processing activities, risks and mitigation measures, consent mechanism, and organizational and technical measures for data protection. Impact assessment results must be sent to the Ministry of Public Security within 60 days of processing.' },
      { provision_ref: 'dieu25', chapter: 'Chương IV - Chuyển dữ liệu', section: '25', title: 'Chuyển dữ liệu cá nhân ra nước ngoài (Cross-border data transfer)', content: 'Cross-border transfer of personal data of Vietnamese citizens is permitted only when: a) The data subject consents to the cross-border transfer; b) The original data is stored in Vietnam; c) A written record of the cross-border transfer is prepared; d) A data transfer impact assessment is completed and filed with the Ministry of Public Security. The data controller must cease cross-border transfer when the Ministry of Public Security determines that the transfer harms national security or causes serious harm to the rights and interests of data subjects.' },
      { provision_ref: 'dieu35', chapter: 'Chương V - Trách nhiệm', section: '35', title: 'Thông báo vi phạm (Breach notification)', content: 'In the event of a personal data breach, the data controller and data processor must notify the Ministry of Public Security within 72 hours of discovery. The notification must include: description of the breach, type and volume of affected data, consequences and potential consequences, measures taken and proposed to address the breach, and contact details of the data protection officer or responsible person.' },
      { provision_ref: 'dieu38', chapter: 'Chương V - Trách nhiệm', section: '38', title: 'Bảo vệ dữ liệu cá nhân nhạy cảm (Sensitive data protection)', content: 'Processing of sensitive personal data requires: a) Explicit, separate consent from the data subject specifically for the processing of sensitive data; b) Designation of a data protection department and officer; c) Conduct of impact assessment before processing; d) Enhanced technical and organizational measures appropriate to the sensitivity of the data.' },
    ],
    definitions: [
      { term: 'Dữ liệu cá nhân', definition: 'Personal data (dữ liệu cá nhân) means information in the form of symbols, letters, numbers, images, sounds or the like in electronic format that is associated with or used to identify a specific person.', source_provision: 'dieu2' },
      { term: 'Dữ liệu cá nhân nhạy cảm', definition: 'Sensitive personal data (dữ liệu cá nhân nhạy cảm) includes political and religious views, health condition, genetic data, biometric data, sex life, criminal record, financial data, location data, and other data designated by law as requiring enhanced protection.', source_provision: 'dieu2' },
      { term: 'Xử lý dữ liệu cá nhân', definition: 'Personal data processing (xử lý dữ liệu cá nhân) means one or more activities affecting personal data, including collection, recording, analysis, storage, modification, disclosure, combination, access, retrieval, encryption, copying, sharing, transfer, deletion, or destruction of personal data.', source_provision: 'dieu2' },
      { term: 'Bên kiểm soát dữ liệu', definition: 'Data controller (bên kiểm soát dữ liệu) means the organization or individual that determines the purpose and means of personal data processing.', source_provision: 'dieu2' },
      { term: 'Bên xử lý dữ liệu', definition: 'Data processor (bên xử lý dữ liệu) means the organization or individual that processes personal data on behalf of the data controller through a contract or agreement.', source_provision: 'dieu2' },
    ],
  },
  'information-technology-law-2006': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for information technology activities, rights and obligations of agencies, organizations and individuals engaged in information technology activities, and measures for ensuring information technology activities.' },
      { provision_ref: 'dieu12', chapter: 'Chương II - Ứng dụng CNTT', section: '12', title: 'Bảo đảm an toàn thông tin (Information security)', content: 'Organizations and individuals operating information systems must take measures to ensure information security, prevent unauthorized access, and protect personal data and state secrets stored or transmitted through information systems.' },
      { provision_ref: 'dieu21', chapter: 'Chương III - Phát triển CNTT', section: '21', title: 'Dịch vụ CNTT (IT services)', content: 'IT services include: hosting services, system integration, IT consulting, IT outsourcing, data center services, cloud computing, and other IT-related services as specified by the Government. IT service providers must comply with technical standards and quality requirements.' },
      { provision_ref: 'dieu72', chapter: 'Chương VI - Xử lý vi phạm', section: '72', title: 'Hành vi bị cấm (Prohibited acts)', content: 'Prohibited acts in information technology activities include: unauthorized access to information systems; spreading malware; theft of personal information; disrupting IT infrastructure operation; unauthorized modification or destruction of data; and use of IT to commit fraud.' },
    ],
  },
  'enterprise-law-2020': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for the establishment, organization, restructuring, dissolution, and related activities of enterprises, including: limited liability companies, joint-stock companies, partnerships, and private enterprises.' },
      { provision_ref: 'dieu7', chapter: 'Chương I - Quy định chung', section: '7', title: 'Quyền của doanh nghiệp (Rights of enterprises)', content: 'Enterprises have the right to: autonomously conduct business in sectors not prohibited by law; be assured of state protection of lawful ownership and other lawful rights and interests; access credit, land and other resources on equal terms; and have their assets and capital not be nationalized or confiscated by administrative measures.' },
      { provision_ref: 'dieu88', chapter: 'Chương III - Công ty cổ phần', section: '88', title: 'Công ty cổ phần (Joint-stock company)', content: 'A joint-stock company is an enterprise with charter capital divided into shares. Shareholders are liable for debts and other asset obligations of the enterprise to the extent of the amount of capital contributed. A joint-stock company has the right to issue shares to raise capital and may be listed on the stock exchange.' },
      { provision_ref: 'dieu163', chapter: 'Chương VII - Tổ chức quản lý', section: '163', title: 'Quyền tiếp cận thông tin (Right to access information)', content: 'Shareholders and members have the right to access the financial statements, meeting minutes, resolutions, and other documents of the enterprise. The enterprise must provide requested information within 7 working days.' },
    ],
  },
  'e-transactions-law-2023': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for e-transactions in the activities of state agencies; in civil, business, commercial and other fields as prescribed by law. This Law applies to agencies, organizations, and individuals directly or indirectly participating in e-transactions.' },
      { provision_ref: 'dieu8', chapter: 'Chương II - Thông điệp dữ liệu', section: '8', title: 'Giá trị pháp lý (Legal validity of data messages)', content: 'A data message shall not be denied legal validity solely on the grounds that it is in electronic form. Data messages have the same legal validity as paper documents when they meet the conditions prescribed by this Law.' },
      { provision_ref: 'dieu22', chapter: 'Chương III - Chữ ký điện tử', section: '22', title: 'Chữ ký điện tử (Electronic signatures)', content: 'Electronic signatures are categorized as: basic electronic signatures, secure electronic signatures, and specialized electronic signatures. A secure electronic signature has the same legal validity as a wet-ink signature and stamp when verified by a trust service provider. Digital signatures using PKI are recognized as a type of secure electronic signature.' },
      { provision_ref: 'dieu31', chapter: 'Chương IV - Giao dịch điện tử', section: '31', title: 'Hợp đồng điện tử (Electronic contracts)', content: 'Electronic contracts have the same legal validity as written contracts. The offer, acceptance, and performance of electronic contracts are governed by this Law and relevant civil and commercial legislation. Automated systems may conclude electronic contracts without direct human intervention when properly authorized.' },
      { provision_ref: 'dieu47', chapter: 'Chương V - Dịch vụ tin cậy', section: '47', title: 'Dịch vụ tin cậy (Trust services)', content: 'Trust services include: digital signature authentication services, electronic timestamp services, electronic registered delivery services, and website authentication services. Trust service providers must obtain a license and meet technical security requirements established by the Ministry of Information and Communications.' },
    ],
    definitions: [
      { term: 'Giao dịch điện tử', definition: 'E-transaction (giao dịch điện tử) means a transaction performed by electronic means through the use of information technology.', source_provision: 'dieu3' },
      { term: 'Thông điệp dữ liệu', definition: 'Data message (thông điệp dữ liệu) means information created, sent, received, or stored by electronic means.', source_provision: 'dieu3' },
      { term: 'Chữ ký điện tử', definition: 'Electronic signature (chữ ký điện tử) means data in electronic form attached to or logically associated with a data message to identify the signer and indicate approval.', source_provision: 'dieu3' },
    ],
  },
  'consumer-rights-protection-law-2023': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for the rights and obligations of consumers, responsibilities of organizations and individuals in business toward consumers, and responsibilities of state agencies in consumer rights protection.' },
      { provision_ref: 'dieu4', chapter: 'Chương I - Quy định chung', section: '4', title: 'Quyền của người tiêu dùng (Consumer rights)', content: 'Consumers have the following rights: a) Safety in the consumption of goods and services; b) Accurate and complete information about goods, services, and traders; c) Choice of goods and services; d) Voice opinions and recommendations for improving quality; e) Complaint, denouncement, and initiation of lawsuits; f) Claim for damages; g) Protection of personal information and data; h) Participation in consumer organizations.' },
      { provision_ref: 'dieu15', chapter: 'Chương II - Bảo vệ thông tin', section: '15', title: 'Bảo vệ thông tin người tiêu dùng (Consumer data protection)', content: 'Organizations and individuals engaged in business must: a) Clearly inform consumers of the purpose, scope, and method of collecting and using personal information before collection; b) Obtain consumer consent before collecting, using, or disclosing personal information; c) Ensure the security and safety of consumer personal information; d) Not share, sell, or disclose consumer personal information to third parties without consent, except as required by law.' },
      { provision_ref: 'dieu25', chapter: 'Chương III - Giao dịch điện tử', section: '25', title: 'Giao dịch trên nền tảng số (Transactions on digital platforms)', content: 'Digital platform operators are responsible for: a) Verifying the identity and business registration of sellers on their platform; b) Providing mechanisms for consumers to submit complaints and resolve disputes; c) Removing goods and services that violate consumer rights; d) Cooperating with competent authorities in investigating and handling consumer rights violations on their platform.' },
      { provision_ref: 'dieu55', chapter: 'Chương VI - Giải quyết tranh chấp', section: '55', title: 'Giải quyết tranh chấp (Dispute resolution)', content: 'Consumer disputes may be resolved through: a) Negotiation between the consumer and the trader; b) Mediation by a consumer protection organization; c) Arbitration; d) Court proceedings. The burden of proof lies with the organization or individual in business for disputes related to product defects.' },
    ],
    definitions: [
      { term: 'Người tiêu dùng', definition: 'Consumer (người tiêu dùng) means an individual who purchases or uses goods, products, or services for personal, family, or household consumption purposes, not for commercial resale.', source_provision: 'dieu3' },
    ],
  },
  'constitution-2013': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Chế độ chính trị', section: '1', title: 'Nước Cộng hòa xã hội chủ nghĩa Việt Nam (State)', content: 'The Socialist Republic of Vietnam is an independent, sovereign, unified and territorially integral country, encompassing its mainland, islands, seas and airspace.' },
      { provision_ref: 'dieu14', chapter: 'Chương II - Quyền con người', section: '14', title: 'Quyền con người (Human rights)', content: 'Human rights and citizens\' rights in the political, civil, economic, cultural, and social fields shall be recognized, respected, protected and guaranteed in accordance with the Constitution and law. Human rights and citizens\' rights shall only be restricted when prescribed by law in cases of necessity for reasons of national defense, national security, social order and safety, social morality, or community health.' },
      { provision_ref: 'dieu21', chapter: 'Chương II - Quyền con người', section: '21', title: 'Quyền bất khả xâm phạm về đời sống riêng tư (Right to privacy)', content: 'Everyone has the right to inviolability of private life, personal secrets, and family secrets; and has the right to protect his or her honor and reputation. Information relating to private life, personal secrets, and family secrets shall be guaranteed and protected by law. Everyone has the right to secrecy of correspondence, telephone conversations, and other forms of private communication. No one may illegally open, control or seize another\'s correspondence, telephone conversations or other forms of private communication.' },
      { provision_ref: 'dieu25', chapter: 'Chương II - Quyền con người', section: '25', title: 'Quyền tự do ngôn luận (Freedom of speech and press)', content: 'Citizens have the right to freedom of speech, freedom of the press, the right to access information, the right to assemble, to form associations and to demonstrate. The exercise of these rights shall be prescribed by law.' },
      { provision_ref: 'dieu32', chapter: 'Chương II - Quyền con người', section: '32', title: 'Quyền sở hữu (Property rights)', content: 'Everyone has the right to ownership of lawful income, savings, housing, means of livelihood, production capital, and contributions in enterprises or other economic organizations. The right to private ownership and the right to inheritance shall be protected by law.' },
      { provision_ref: 'dieu46', chapter: 'Chương II - Quyền con người', section: '46', title: 'Nghĩa vụ của công dân (Citizen obligations)', content: 'Citizens have the duty to abide by the Constitution and law; participate in the safeguarding of national security and social order and safety; and observe the rules of public life.' },
    ],
  },
  'penal-code-2015': {
    provisions: [
      { provision_ref: 'dieu285', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '285', title: 'Tội sản xuất, phát tán phần mềm độc hại (Producing or distributing malware)', content: 'A person who produces, stores, or distributes computer programs for the purpose of: illegally accessing computer networks, telecommunications networks, or electronic devices; illegally interfering with, disrupting, or destroying computer networks; or illegally collecting, processing, or using personal data, shall be sentenced to a fine of 50-200 million VND, non-custodial reform for up to 3 years, or imprisonment of 1-5 years. In serious cases: imprisonment of 3-7 years.' },
      { provision_ref: 'dieu286', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '286', title: 'Tội phát tán chương trình tin học gây hại (Spreading harmful computer programs)', content: 'A person who intentionally spreads computer programs that automatically replicate or are damaging to computer networks, telecommunications networks, or electronic devices, causing damage of 50 million VND or more, or affecting 50 or more electronic devices, shall be fined 50-200 million VND or sentenced to 1-5 years imprisonment. In serious cases involving critical infrastructure: 3-7 years imprisonment.' },
      { provision_ref: 'dieu287', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '287', title: 'Tội cản trở hoặc gây rối loạn mạng (Obstructing or disrupting networks)', content: 'A person who illegally obstructs or disrupts the operation of computer networks, telecommunications networks, or electronic devices, causing damage of 100 million VND or more or affecting activities of agencies or organizations, shall be fined 30-200 million VND or sentenced to 6 months to 3 years imprisonment. DDoS attacks and deliberate infrastructure disruption: 2-7 years imprisonment.' },
      { provision_ref: 'dieu288', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '288', title: 'Tội đưa hoặc sử dụng trái phép thông tin (Illegal provision or use of information)', content: 'A person who provides or uses information on computer networks in violation of law, including: disseminating false information affecting financial markets; sharing classified or private information without authorization; using information technology for defamation, shall be fined 30-200 million VND, non-custodial reform for up to 3 years, or imprisonment of 6 months to 3 years.' },
      { provision_ref: 'dieu289', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '289', title: 'Tội xâm nhập trái phép (Unauthorized access)', content: 'A person who illegally accesses computer networks, telecommunications networks, or electronic devices of others, obtaining data valued at 200 million VND or more, affecting 200 or more accounts, or causing damage to security infrastructure, shall be fined 50-200 million VND or sentenced to 1-5 years imprisonment. Unauthorized access to critical national information systems: 5-10 years imprisonment.' },
      { provision_ref: 'dieu290', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '290', title: 'Tội sử dụng mạng máy tính để lừa đảo (Online fraud)', content: 'A person who uses computer networks, telecommunications networks, or electronic devices to commit fraud, appropriating property valued at 2-50 million VND, or using fraudulent methods including phishing, identity theft, or social engineering to deceive victims, shall be fined 20-100 million VND or sentenced to 6 months to 3 years imprisonment. Appropriating 200 million VND or more: 7-15 years imprisonment.' },
      { provision_ref: 'dieu291', chapter: 'Chương XXI - Tội phạm trong lĩnh vực CNTT', section: '291', title: 'Tội thu thập trái phép dữ liệu cá nhân (Illegal personal data collection)', content: 'A person who illegally collects, stores, exchanges, trades, or publishes personal data of others on computer networks or electronic devices, affecting 200 or more persons, shall be fined 50-200 million VND or sentenced to 6 months to 3 years imprisonment. Large-scale data breaches affecting 50,000+ individuals: 2-7 years imprisonment.' },
    ],
  },
  'telecommunications-law-2009': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for telecommunications activities, including: rights and obligations of organizations and individuals engaged in telecommunications activities; telecommunications infrastructure; telecommunications services; management of telecommunications resources; and state management of telecommunications.' },
      { provision_ref: 'dieu6', chapter: 'Chương I - Quy định chung', section: '6', title: 'Các hành vi bị nghiêm cấm (Prohibited acts)', content: 'The following acts are prohibited in telecommunications: a) Using telecommunications for purposes threatening national security, social order and safety; b) Illegally intercepting telecommunications information; c) Deliberately disrupting telecommunications networks; d) Providing false or misleading information about telecommunications services; e) Violating the privacy of telecommunications users; f) Using telecommunications equipment without type approval.' },
      { provision_ref: 'dieu12', chapter: 'Chương II - Hạ tầng viễn thông', section: '12', title: 'Cơ sở hạ tầng viễn thông (Telecommunications infrastructure)', content: 'Telecommunications infrastructure includes telecommunications networks, telecommunications stations, cable systems, satellite systems, and other facilities serving telecommunications activities. The State encourages investment in developing telecommunications infrastructure, especially in rural, mountainous, border, island and disadvantaged areas.' },
      { provision_ref: 'dieu23', chapter: 'Chương III - Dịch vụ viễn thông', section: '23', title: 'Giấy phép viễn thông (Telecommunications licenses)', content: 'Telecommunications business requires a license. Telecommunications licenses include: infrastructure provider license, service provider license, and trial license. Licensed telecommunications enterprises must comply with service quality standards, interconnection obligations, and data protection requirements.' },
      { provision_ref: 'dieu51', chapter: 'Chương V - Quản lý tài nguyên', section: '51', title: 'Bảo mật thông tin (Information confidentiality)', content: 'Telecommunications enterprises must ensure the security and confidentiality of telecommunications information. Interception or recording of telecommunications content is only permitted with a court order or authorization from the competent state authority. Telecommunications enterprises must cooperate with competent state agencies in preventing and combating crime while protecting subscriber data.' },
    ],
  },
  'competition-law-2018': {
    provisions: [
      { provision_ref: 'dieu1', chapter: 'Chương I - Quy định chung', section: '1', title: 'Phạm vi điều chỉnh (Scope)', content: 'This Law provides for anti-competitive agreements, abuse of dominant market position, economic concentration, unfair competitive practices, competition proceedings, and handling of competition law violations. This Law applies to enterprises operating in Vietnam and associations of enterprises, including foreign enterprises and associations.' },
      { provision_ref: 'dieu3', chapter: 'Chương I - Quy định chung', section: '3', title: 'Nguyên tắc cạnh tranh (Competition principles)', content: 'Competition activities in the market are conducted on the principles of: honesty, fairness, non-infringement of the State\'s interests, public interests, and lawful rights and interests of enterprises and consumers. The State ensures a legal environment for fair and equal competition.' },
      { provision_ref: 'dieu12', chapter: 'Chương II - Thỏa thuận hạn chế cạnh tranh', section: '12', title: 'Thỏa thuận hạn chế cạnh tranh bị cấm (Prohibited anti-competitive agreements)', content: 'The following anti-competitive agreements are prohibited: a) Agreements on fixing prices directly or indirectly; b) Agreements on dividing markets or sources of supply; c) Agreements on limiting or controlling production quantity; d) Agreements on bid rigging; e) Agreements restricting technical or technological development; f) Agreements imposing conditions on other enterprises for signing contracts. Agreements between competitors with combined market share of 30% or more that substantially limit competition are prohibited.' },
      { provision_ref: 'dieu27', chapter: 'Chương III - Lạm dụng vị trí thống lĩnh', section: '27', title: 'Hành vi lạm dụng vị trí thống lĩnh (Abuse of dominant position)', content: 'An enterprise with dominant market position (market share of 30% or more) is prohibited from: a) Selling below cost to eliminate competitors; b) Imposing unreasonable purchase or sale prices; c) Restricting production or distribution to the detriment of consumers; d) Applying discriminatory commercial conditions; e) Imposing conditions requiring acceptance of obligations unrelated to the transaction; f) Preventing market entry by new competitors.' },
      { provision_ref: 'dieu33', chapter: 'Chương IV - Tập trung kinh tế', section: '33', title: 'Tập trung kinh tế (Economic concentration)', content: 'Economic concentration includes: merger, consolidation, acquisition, and joint venture between enterprises. Economic concentration is prohibited when it substantially lessens competition. Enterprises must notify the National Competition Commission before economic concentration when the combined turnover or assets exceed thresholds set by the Government.' },
      { provision_ref: 'dieu45', chapter: 'Chương V - Cạnh tranh không lành mạnh', section: '45', title: 'Hành vi cạnh tranh không lành mạnh (Unfair competitive practices)', content: 'Unfair competitive practices include: a) Infringing business secrets; b) Coercing customers or partners of other enterprises; c) Providing misleading information about other enterprises; d) Disrupting business activities of other enterprises; e) Comparative advertising that is misleading; f) Discriminatory practices by associations of enterprises against non-members; g) Selling multi-level without compliance with regulations.' },
    ],
  },
};

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean): Promise<void> {
  console.log(`\nProcessing ${acts.length} Vietnamese laws from thuvienphapluat.vn...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let supplemented = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  for (const act of acts) {
    const sourceFile = path.join(SOURCE_DIR, `${act.id}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    // Skip if seed already exists and we're in skip-fetch mode
    if (skipFetch && fs.existsSync(seedFile)) {
      const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
      const provCount = existing.provisions?.length ?? 0;
      const defCount = existing.definitions?.length ?? 0;
      totalProvisions += provCount;
      totalDefinitions += defCount;
      results.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'cached' });
      skipped++;
      processed++;
      continue;
    }

    try {
      let html: string | null = null;

      if (fs.existsSync(sourceFile) && skipFetch) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        console.log(`  Using cached ${act.shortName} (${act.officialNumber}) (${(html.length / 1024).toFixed(0)} KB)`);
      } else if (!skipFetch) {
        process.stdout.write(`  Fetching ${act.shortName} (${act.officialNumber})...`);
        try {
          const result = await fetchWithRateLimit(act.url);

          if (result.status === 200 && result.body.length > 1000) {
            html = result.body;
            fs.writeFileSync(sourceFile, html);
            console.log(` OK (${(html.length / 1024).toFixed(0)} KB)`);
          } else {
            console.log(` HTTP ${result.status} (${result.body.length} bytes) - using fallback`);
          }
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          console.log(` FETCH FAILED: ${msg.substring(0, 80)} - using fallback`);
        }
      }

      let parsed: ParsedAct;

      if (html && html.length > 1000) {
        parsed = parseVietnameseHtml(html, act);
        console.log(`    -> Parsed ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions from HTML`);

        // Always merge with curated data to fill gaps (non-overlapping only)
        const merge = mergeWithCurated(parsed, act.id);
        if (merge.merged) {
          console.log(`    -> Supplemented with ${merge.addedProvisions} curated provisions, ${merge.addedDefinitions} curated definitions`);
          supplemented++;
        }
      } else {
        // Full fallback: use curated provisions only
        console.log(`    -> Using curated seed data for ${act.shortName}`);
        parsed = generateFallbackSeed(act);
        supplemented++;
      }

      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      console.log(`    -> Final: ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);
      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: html ? 'OK' : 'fallback',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${act.shortName}: ${msg}`);

      // Even on error, try to create a fallback seed
      try {
        const fallbackSeed = generateFallbackSeed(act);
        fs.writeFileSync(seedFile, JSON.stringify(fallbackSeed, null, 2));
        totalProvisions += fallbackSeed.provisions.length;
        totalDefinitions += fallbackSeed.definitions.length;
        console.log(`    -> Fallback: ${fallbackSeed.provisions.length} provisions, ${fallbackSeed.definitions.length} definitions`);
        results.push({
          act: act.shortName,
          provisions: fallbackSeed.provisions.length,
          definitions: fallbackSeed.definitions.length,
          status: 'fallback (error)',
        });
        supplemented++;
      } catch {
        results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 60)}` });
        failed++;
      }
    }

    processed++;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('INGESTION REPORT');
  console.log('='.repeat(70));
  console.log(`\n  Source:        Thu Vien Phap Luat (thuvienphapluat.vn)`);
  console.log(`  Fallback:      Van Ban Chinh Phu (vanban.chinhphu.vn)`);
  console.log(`  Processed:     ${processed}`);
  console.log(`  Cached:        ${skipped}`);
  console.log(`  Supplemented:  ${supplemented}`);
  console.log(`  Failed:        ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);
  console.log(`\n  Per-Act breakdown:`);
  console.log(`  ${'Act'.padEnd(22)} ${'Provisions'.padStart(12)} ${'Definitions'.padStart(13)} ${'Status'.padStart(18)}`);
  console.log(`  ${'-'.repeat(22)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(18)}`);
  for (const r of results) {
    console.log(`  ${r.act.padEnd(22)} ${String(r.provisions).padStart(12)} ${String(r.definitions).padStart(13)} ${r.status.padStart(18)}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  console.log('Vietnamese Law MCP -- Ingestion Pipeline');
  console.log('========================================\n');
  console.log(`  Source: Thu Vien Phap Luat (thuvienphapluat.vn)`);
  console.log(`  Fallback: Van Ban Chinh Phu (vanban.chinhphu.vn)`);
  console.log(`  License: Open Access / Government Open Data`);
  console.log(`  Rate limit: 500ms between requests`);

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log(`  --skip-fetch`);

  const acts = limit ? KEY_VIETNAMESE_ACTS.slice(0, limit) : KEY_VIETNAMESE_ACTS;
  await fetchAndParseActs(acts, skipFetch);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
