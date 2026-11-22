/**
 * GEORGIA BANK COMPANIES THAT FILE WITH THE U.S. SECURITIES AND EXCHANGE COMMISSION
 *
 * Two groups, both read from published registers on 2026-11-22:
 *
 *   GEORGIA - bank holding companies whose SEC business address is in Georgia and whose
 *   SIC code is a banking code (6021, 6022, 6035, 6036, 6712, 6199). Each was found by
 *   matching the holding-company name the FDIC reports for a Georgia institution
 *   (NAMEHCR in the FDIC BankFind institutions response, STALP:GA, ACTIVE:1) against
 *   the SEC company name index, then confirming the SEC record itself. The bank name is
 *   the FDIC institution the holding company owns.
 *
 *   OPERATES_IN_GEORGIA - large regionals whose bank operates Georgia branches in the
 *   FDIC Summary of Deposits response but whose holding company is domiciled elsewhere.
 *   They are kept because their Georgia branch deposits are monitored, and marked so the
 *   distinction between a Georgia-chartered bank and an out-of-state bank with Georgia
 *   branches is never blurred.
 *
 * The ticker is blank when the company has no listed ticker. Form 4 filings are fetched
 * live from EDGAR for every company here; this file never contains generated people or
 * transactions.
 */

export type FilerScope = 'GEORGIA' | 'OPERATES_IN_GEORGIA';

export interface GaBankFiler {
  key: string;
  name: string;
  cik: string;
  ticker: string;
  city: string;
  /** FDIC institution the holding company owns. */
  bank: string;
  holdingCompany: string;
  scope: FilerScope;
}

export const GA_BANK_FILERS: GaBankFiler[] = [
  { key: 'ameris-bancorp', name: 'Ameris Bancorp', cik: '351569', ticker: 'ABCB', city: 'ATLANTA', bank: 'Ameris Bank', holdingCompany: 'AMERIS BCORP', scope: 'GEORGIA' },
  { key: 'bainbridge-bancshares-inc', name: 'BAINBRIDGE BANCSHARES INC', cik: '1266525', ticker: '', city: 'BAINBRIDGE', bank: 'First National Bank of Decatur County', holdingCompany: 'BAINBRIDGE BANCSHARES INC', scope: 'GEORGIA' },
  { key: 'cbc-holding-co', name: 'CBC HOLDING CO', cik: '1038359', ticker: '', city: 'FITZGERALD', bank: 'Community Banking Company', holdingCompany: 'CBC HOLDING CO', scope: 'GEORGIA' },
  { key: 'citizens-bancshares-corp', name: 'CITIZENS BANCSHARES CORP', cik: '356276', ticker: '', city: 'ATLANTA', bank: 'Citizens Trust Bank', holdingCompany: 'CITIZENS BANCSHARES CORP', scope: 'GEORGIA' },
  { key: 'colony-bankcorp-inc', name: 'COLONY BANKCORP INC', cik: '711669', ticker: 'CBAN', city: 'FITZGERALD', bank: 'Colony Bank', holdingCompany: 'COLONY BANKCORP INC', scope: 'GEORGIA' },
  { key: 'community-banks-of-georgia-inc', name: 'COMMUNITY BANKS OF GEORGIA INC', cik: '1273555', ticker: '', city: 'JASPER', bank: 'Community Bank of Pickens County', holdingCompany: 'COMMUNITY BANKS OF GEORGIA INC', scope: 'GEORGIA' },
  { key: 'community-capital-bancshares-inc', name: 'COMMUNITY CAPITAL BANCSHARES INC', cik: '1074369', ticker: '', city: 'ALBANY', bank: 'AB&T', holdingCompany: 'COMMUNITY CAPITAL BANCSHARES', scope: 'GEORGIA' },
  { key: 'csra-bank-corp', name: 'CSRA BANK CORP', cik: '862477', ticker: '', city: 'WRENS', bank: 'First State Bank', holdingCompany: 'CSRA BANK CORP', scope: 'GEORGIA' },
  { key: 'first-century-bancorp', name: 'FIRST CENTURY BANCORP.', cik: '1124676', ticker: '', city: 'ROSWELL', bank: 'First Century Bank, National Association', holdingCompany: 'FIRST CENTURY BCORP', scope: 'GEORGIA' },
  { key: 'first-chatsworth-bankshares-inc', name: 'FIRST CHATSWORTH BANKSHARES INC', cik: '708492', ticker: '', city: 'CHATSWORTH', bank: 'First National Community Bank', holdingCompany: 'FIRST CHATSWORTH BANKSHARES', scope: 'GEORGIA' },
  { key: 'fnc-bancorp-inc', name: 'FNC BANCORP INC', cik: '868573', ticker: '', city: 'DOUGLAS', bank: 'First National Bank of Coffee County', holdingCompany: 'FNC BCORP INC', scope: 'GEORGIA' },
  { key: 'forsyth-bancshares-inc', name: 'FORSYTH BANCSHARES INC', cik: '1021479', ticker: '', city: 'CUMMING', bank: 'The Citizens Bank of Georgia', holdingCompany: 'FORSYTH BANCSHARES INC', scope: 'GEORGIA' },
  { key: 'georgia-banking-co-inc', name: 'GEORGIA BANKING CO INC', cik: '1070965', ticker: 'GBC', city: 'ATLANTA', bank: 'Georgia Banking Company', holdingCompany: 'GEORGIA BANKING CO INC', scope: 'GEORGIA' },
  { key: 'metrocity-bankshares-inc', name: 'MetroCity Bankshares, Inc.', cik: '1747068', ticker: 'MCBS', city: 'DORAVILLE', bank: 'Metro City Bank', holdingCompany: 'METROCITY BANKSHARES INC', scope: 'GEORGIA' },
  { key: 'oconee-financial-corp', name: 'OCONEE FINANCIAL CORP', cik: '1076691', ticker: 'OSBK', city: 'WATKINSVILLE', bank: 'Oconee State Bank', holdingCompany: 'OCONEE FINANCIAL CORP', scope: 'GEORGIA' },
  { key: 'queensborough-co', name: 'QUEENSBOROUGH CO', cik: '768157', ticker: '', city: 'AUGUSTA', bank: 'Queensborough National Bank & Trust Company', holdingCompany: 'QUEENSBOROUGH CO THE', scope: 'GEORGIA' },
  { key: 'soperton-bancshares-inc', name: 'SOPERTON BANCSHARES Inc', cik: '835594', ticker: '', city: 'SOPERTON', bank: 'Georgia First Bank', holdingCompany: 'SOPERTON BANCSHARES INC', scope: 'GEORGIA' },
  { key: 'south-banking-co', name: 'SOUTH BANKING CO', cik: '351566', ticker: '', city: 'ALMA', bank: 'Pineland Bank', holdingCompany: 'SOUTH BANKING CO', scope: 'GEORGIA' },
  { key: 'southeastern-banking-corp', name: 'SOUTHEASTERN BANKING CORP', cik: '353386', ticker: '', city: 'DARIEN', bank: 'Southeastern Bank', holdingCompany: 'SOUTHEASTERN BANKING CORP', scope: 'GEORGIA' },
  { key: 'thomasville-bancshares-inc', name: 'THOMASVILLE BANCSHARES INC', cik: '944468', ticker: '', city: 'THOMASVILLE', bank: 'Thomasville National Bank', holdingCompany: 'THOMASVILLE BANCSHARES INC', scope: 'GEORGIA' },
  { key: 'touchmark-bancshares-inc', name: 'Touchmark Bancshares, Inc.', cik: '1403008', ticker: '', city: 'ALPHARETTA', bank: 'Touchmark National Bank', holdingCompany: 'TOUCHMARK BANCSHARES INC', scope: 'GEORGIA' },
  { key: 'wb-t-bankshares-inc', name: 'WB&T BANKSHARES INC', cik: '855354', ticker: '', city: 'WAYCROSS', bank: 'South Coast Bank & Trust', holdingCompany: 'WB&T BANKSHARES INC', scope: 'GEORGIA' },
  { key: 'truist-financial-corp', name: 'Truist Financial Corp', cik: '92230', ticker: 'TFC', city: 'CHARLOTTE, NC', bank: 'Truist Bank', holdingCompany: 'TRUIST FINANCIAL CORP', scope: 'OPERATES_IN_GEORGIA' },
  { key: 'regions-financial-corp', name: 'Regions Financial Corp', cik: '1281761', ticker: 'RF', city: 'BIRMINGHAM, AL', bank: 'Regions Bank', holdingCompany: 'REGIONS FINANCIAL CORP', scope: 'OPERATES_IN_GEORGIA' },
  { key: 'renasant-corp', name: 'Renasant Corp', cik: '715072', ticker: 'RNST', city: 'TUPELO, MS', bank: 'Renasant Bank', holdingCompany: 'RENASANT CORP', scope: 'OPERATES_IN_GEORGIA' },
  { key: 'united-community-banks-inc', name: 'United Community Banks Inc', cik: '857855', ticker: 'UCB', city: 'GREENVILLE, SC', bank: 'United Community Bank', holdingCompany: 'UNITED COMMUNITY BANKS INC', scope: 'OPERATES_IN_GEORGIA' },
  { key: 'southstate-bank-corp', name: 'SouthState Bank Corp', cik: '764038', ticker: 'SSB', city: 'WINTER HAVEN, FL', bank: 'SouthState Bank, National Association', holdingCompany: 'SOUTHSTATE CORP', scope: 'OPERATES_IN_GEORGIA' },
];

export const GA_BANK_FILER_SOURCE = {
  institutions: 'FDIC BankFind institutions API, filters STALP:GA AND ACTIVE:1, retrieved 2026-11-22',
  filerIndex: 'SEC EDGAR full company name index (cik-lookup-data.txt)',
  ownership: 'FDIC NAMEHCR (holding company name) matched to the SEC filer name',
  filings: 'SEC EDGAR Form 4 filings, fetched live and cached for one week',
  refreshed: '2026-11-22',
} as const;

export const FILER_BY_CIK = new Map(GA_BANK_FILERS.map((filer) => [filer.cik, filer]));
export const FILER_BY_KEY = new Map(GA_BANK_FILERS.map((filer) => [filer.key, filer]));
