import { db } from "./db";
import { creditsafeReports, leads } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { CreditsafeReport, InsertCreditsafeReport } from "@shared/schema";

const BASE_URL = "https://connect.creditsafe.com/v1";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function authenticate(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const username = process.env.CREDITSAFE_USERNAME;
  const password = process.env.CREDITSAFE_PASSWORD;

  if (!username || !password) {
    throw new Error("Credenziali CreditSafe non configurate");
  }

  const res = await fetch(`${BASE_URL}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Autenticazione CreditSafe fallita: ${res.status} ${errText}`);
  }

  const data = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken!;
}

export async function searchCompanyByVat(vatNumber: string): Promise<any> {
  const token = await authenticate();

  const cleanVat = vatNumber.replace(/\s+/g, "").replace(/^IT/i, "");
  console.log(`[CreditSafe] Searching company with VAT: ${cleanVat}`);

  const res = await fetch(
    `${BASE_URL}/companies?countries=IT&vatNo=${encodeURIComponent(cleanVat)}&pageSize=5`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[CreditSafe] Search error ${res.status}:`, errText);
    throw new Error(`Ricerca CreditSafe fallita: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const count = data?.companies?.length || 0;
  console.log(`[CreditSafe] Found ${count} companies for VAT ${cleanVat}`);
  if (count > 0) {
    console.log(`[CreditSafe] First match: ${data.companies[0].name} (id: ${data.companies[0].id})`);
  }
  return data;
}

export async function getCompanyReport(connectId: string): Promise<any> {
  const token = await authenticate();

  console.log(`[CreditSafe] Fetching report for connectId: ${connectId}`);

  const res = await fetch(
    `${BASE_URL}/companies/${encodeURIComponent(connectId)}?language=it&template=financial`,
    {
      headers: { 
        Authorization: `Bearer ${token}`,
        "Accept": "application/json",
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[CreditSafe] Report error ${res.status}:`, errText);
    if (res.status === 403) {
      throw new Error("Accesso al report negato. Verificare che il piano CreditSafe includa i report per l'Italia.");
    }
    throw new Error(`Report CreditSafe fallito: ${res.status} ${errText}`);
  }

  const data = await res.json();
  console.log(`[CreditSafe] Report received successfully for connectId: ${connectId}`);
  return data;
}

function extractFinancialYears(allStatements: any[], field: string): { year: number; value: number }[] {
  if (!Array.isArray(allStatements) || allStatements.length === 0) return [];

  const localIT = allStatements.filter((fs: any) => fs?.type === "LocalFinancialsCSIT" && fs?.yearEndDate);
  const globalGGS = allStatements.filter((fs: any) => fs?.type === "GlobalFinancialsGGS" && fs?.yearEndDate);
  const statements = localIT.length > 0 ? localIT : globalGGS.length > 0 ? globalGGS : allStatements.filter((fs: any) => fs?.yearEndDate);

  return statements
    .sort((a: any, b: any) => new Date(b.yearEndDate).getTime() - new Date(a.yearEndDate).getTime())
    .slice(0, 3)
    .map((fs: any) => {
      const year = new Date(fs.yearEndDate).getFullYear();
      let value = 0;

      if (field === "revenue") {
        value = fs?.profitAndLoss?.totalValueOfProduction ?? fs?.profitAndLoss?.revenue ?? fs?.profitAndLoss?.operatingRevenue ?? 0;
      } else if (field === "cashFlow") {
        value = fs?.profitAndLoss?.cashFlowPL ?? fs?.profitAndLoss?.ebitda ?? fs?.otherFinancials?.cashFlow ?? fs?.balanceSheet?.cash ?? 0;
      } else if (field === "profit") {
        value = fs?.profitAndLoss?.profitOrLossForTheYear ?? fs?.profitAndLoss?.profitAfterTax ?? fs?.profitAndLoss?.preTaxResult ?? 0;
      }

      return { year, value };
    })
    .reverse();
}

function extractPaymentDays(paymentData: any): { year: number; value: number }[] {
  if (!paymentData) return [];
  
  if (Array.isArray(paymentData)) {
    return paymentData
      .filter((p: any) => p?.year || p?.date)
      .sort((a: any, b: any) => {
        const yearA = a.year || new Date(a.date).getFullYear();
        const yearB = b.year || new Date(b.date).getFullYear();
        return yearA - yearB;
      })
      .slice(-3)
      .map((p: any) => ({
        year: p.year || new Date(p.date).getFullYear(),
        value: p.averageDays || p.dbt || p.averagePaymentDays || 0,
      }));
  }
  
  if (paymentData.dbt !== undefined) {
    return [{ year: new Date().getFullYear(), value: paymentData.dbt }];
  }

  return [];
}

export function parseReportData(report: any, leadId: string, companyId: string): InsertCreditsafeReport {
  const r = report?.report || report;
  const creditScore = r?.creditScore;
  const allFinancials = [
    ...(r?.localFinancialStatements || []),
    ...(r?.financialStatements || []),
  ];
  const paymentData = r?.paymentData || r?.negativeInformation?.paymentData;
  const companyInfo = r?.companySummary || r?.companyIdentification || {};
  const altSummary = r?.alternateSummary || {};

  const providerValue = creditScore?.currentCreditRating?.providerValue;
  let scoreNum: number | null = null;
  if (providerValue != null) {
    if (typeof providerValue === "object" && providerValue.value != null) {
      scoreNum = parseInt(String(providerValue.value), 10);
    } else {
      scoreNum = parseInt(String(providerValue), 10);
    }
    if (isNaN(scoreNum)) scoreNum = null;
  }

  const creditLimit = creditScore?.currentCreditRating?.creditLimit || creditScore?.currentContractLimit;
  let limitNum: number | null = null;
  if (creditLimit?.value != null) {
    limitNum = Math.round(Number(creditLimit.value));
    if (isNaN(limitNum)) limitNum = null;
  }

  return {
    leadId,
    companyId,
    connectId: r?.companyId || null,
    creditScore: scoreNum,
    creditRating: creditScore?.currentCreditRating?.commonValue || creditScore?.currentCreditRating?.creditScoreNational?.value || null,
    internationalScore: creditScore?.currentCreditRating?.commonDescription || creditScore?.internationalScore?.value || null,
    contractLimit: limitNum,
    contractLimitCurrency: creditLimit?.currency || "EUR",
    incorporationDate: altSummary?.incorporationDate || companyInfo?.companyRegistrationDate || companyInfo?.incorporationDate || null,
    companyStatus: altSummary?.companyStatus?.status || companyInfo?.companyStatus?.status || r?.companyStatus || null,
    revenue: extractFinancialYears(allFinancials, "revenue"),
    cashFlow: extractFinancialYears(allFinancials, "cashFlow"),
    profit: extractFinancialYears(allFinancials, "profit"),
    avgPaymentDays: extractPaymentDays(paymentData),
    rawReport: report,
    fetchedAt: new Date(),
  };
}

export async function fetchAndSaveReport(
  leadId: string, 
  companyId: string, 
  vatNumber: string
): Promise<CreditsafeReport> {
  const searchResult = await searchCompanyByVat(vatNumber);
  
  const companies = searchResult?.companies;
  if (!companies || companies.length === 0) {
    throw new Error("Nessuna azienda trovata con questa P.IVA su CreditSafe");
  }

  const company = companies[0];
  const connectId = company.id;

  const reportData = await getCompanyReport(connectId);

  const parsed = parseReportData(reportData, leadId, companyId);

  const existing = await db.select()
    .from(creditsafeReports)
    .where(eq(creditsafeReports.leadId, leadId))
    .limit(1);

  let result: CreditsafeReport;
  if (existing.length > 0) {
    const [updated] = await db.update(creditsafeReports)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(creditsafeReports.id, existing[0].id))
      .returning();
    result = updated;
  } else {
    const [inserted] = await db.insert(creditsafeReports)
      .values(parsed)
      .returning();
    result = inserted;
  }

  const r = reportData?.report || reportData;
  const altSummary = r?.alternateSummary || {};
  const companyInfo = r?.companySummary || r?.companyIdentification || {};
  const address = altSummary?.contactAddress || r?.contactInformation?.mainAddress || companyInfo?.mainAddress || {};
  
  const updateData: Record<string, any> = {};
  if (altSummary?.businessName || companyInfo?.businessName || r?.companyName) {
    updateData.name = altSummary.businessName || companyInfo.businessName || r.companyName;
  }
  if (address?.street && address?.houseNumber) {
    updateData.address = `${address.street} ${address.houseNumber}`;
  } else if (address?.simpleValue) {
    const simpleAddr = address.simpleValue.split(",")[0]?.trim();
    if (simpleAddr) updateData.address = simpleAddr;
  } else if (address?.street) {
    updateData.address = address.street;
  }
  if (address?.city) {
    updateData.city = address.city;
  }
  if (address?.postalCode || address?.postCode) {
    updateData.zipCode = address.postalCode || address.postCode;
  }
  if (address?.province) {
    updateData.province = address.province;
  }
  if (altSummary?.taxCode || altSummary?.vatRegistrationNumber) {
    updateData.fiscalCode = altSummary.taxCode || altSummary.vatRegistrationNumber;
  } else if (r?.companyIdentification?.basicInformation?.registeredCompany?.fiscalCode) {
    updateData.fiscalCode = r.companyIdentification.basicInformation.registeredCompany.fiscalCode;
  }
  if (altSummary?.vatRegistrationNumber) {
    updateData.vatNumber = altSummary.vatRegistrationNumber;
  }
  if (altSummary?.telephone && typeof altSummary.telephone === "string") {
    updateData.phone = altSummary.telephone;
  }
  if (altSummary?.emailAddresses) {
    const emails = altSummary.emailAddresses;
    if (typeof emails === "string") {
      updateData.pecEmail = emails;
    } else if (Array.isArray(emails) && emails.length > 0) {
      updateData.pecEmail = typeof emails[0] === "string" ? emails[0] : emails[0]?.value || emails[0]?.email || String(emails[0]);
    }
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(leads)
      .set(updateData)
      .where(eq(leads.id, leadId));
  }

  return result;
}

export async function getReportByLeadId(leadId: string, companyId?: string): Promise<CreditsafeReport | null> {
  const conditions = [eq(creditsafeReports.leadId, leadId)];
  if (companyId) {
    conditions.push(eq(creditsafeReports.companyId, companyId));
  }
  const [report] = await db.select()
    .from(creditsafeReports)
    .where(and(...conditions))
    .limit(1);
  return report || null;
}
