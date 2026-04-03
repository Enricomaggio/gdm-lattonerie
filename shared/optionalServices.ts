import type { ArticleVariant } from "./schema";

export interface DynamicServiceEntry {
  id: string;
  label: string;
  articleId: string;
  articleCode: string;
  variantIndex?: number;
  serviceType: 'mounting' | 'rental';
  applyTrasferta: boolean;
  unit: string;
  displayOrder: number;
}

export interface ArticleForPricing {
  id?: string;
  code: string;
  name?: string;
  basePrice: string;
  unitType?: string;
  pricingLogic?: string;
  pricingData?: any;
  installationData?: any;
  variantsData?: ArticleVariant[] | null;
  isAdditionalService?: number;
  serviceDescriptionMounting?: string | null;
  serviceDescriptionRental?: string | null;
  serviceMountingApplyTrasferta?: number;
  serviceUnitMounting?: string | null;
  displayOrder?: number;
}

const unitTypeToUnit: Record<string, string> = {
  MQ: "mq.",
  ML: "mt.",
  CAD: "cad.1",
  NUM: "n.",
  MC: "mc.",
  PZ: "pz.",
  MT: "mt.",
};

export function buildDynamicServices(articles: ArticleForPricing[]): DynamicServiceEntry[] {
  const services: DynamicServiceEntry[] = [];

  for (const article of articles) {
    if (!article.id) continue;

    const unitLabel = unitTypeToUnit[article.unitType || "CAD"] || "cad.1";
    const baseOrder = article.displayOrder || 0;

    const hasVariants = article.variantsData && article.variantsData.length > 0;
    const hasArticleLevelService = article.isAdditionalService === 1;

    if (hasVariants) {
      article.variantsData!.forEach((variant, vIdx) => {
        if (!variant.isAdditionalService) return;

        if (variant.serviceDescriptionMounting) {
          services.push({
            id: `${article.code}_v${vIdx}_mounting`,
            label: variant.serviceDescriptionMounting,
            articleId: article.id!,
            articleCode: article.code,
            variantIndex: vIdx,
            serviceType: 'mounting',
            applyTrasferta: variant.serviceMountingApplyTrasferta || false,
            unit: `€/${unitLabel}`,
            displayOrder: baseOrder,
          });
        }

        if (variant.serviceDescriptionRental) {
          services.push({
            id: `${article.code}_v${vIdx}_rental`,
            label: variant.serviceDescriptionRental,
            articleId: article.id!,
            articleCode: article.code,
            variantIndex: vIdx,
            serviceType: 'rental',
            applyTrasferta: false,
            unit: (article.pricingLogic === 'SERVICE' || article.pricingLogic === 'SALE') ? `€/${unitLabel}` : `€/${unitLabel}/mese`,
            displayOrder: baseOrder,
          });
        }
      });
    }

    if (hasArticleLevelService) {
      if (article.serviceDescriptionMounting) {
        const mountingUnitLabel = article.serviceUnitMounting 
          ? (unitTypeToUnit[article.serviceUnitMounting] || unitLabel)
          : unitLabel;
        services.push({
          id: `${article.code}_mounting`,
          label: article.serviceDescriptionMounting,
          articleId: article.id!,
          articleCode: article.code,
          serviceType: 'mounting',
          applyTrasferta: (article.serviceMountingApplyTrasferta || 0) === 1,
          unit: `€/${mountingUnitLabel}`,
          displayOrder: baseOrder,
        });
      }

      if (article.serviceDescriptionRental) {
        services.push({
          id: `${article.code}_rental`,
          label: article.serviceDescriptionRental,
          articleId: article.id!,
          articleCode: article.code,
          serviceType: 'rental',
          applyTrasferta: false,
          unit: (article.pricingLogic === 'SERVICE' || article.pricingLogic === 'SALE') ? `€/${unitLabel}` : `€/${unitLabel}/mese`,
          displayOrder: baseOrder,
        });
      }
    }
  }

  services.sort((a, b) => a.displayOrder - b.displayOrder);
  return services;
}

export function getTrasfertaMultiplier(distanceKm: number): number {
  if (distanceKm < 70) return 1.0;
  if (distanceKm < 100) return 1.10;
  if (distanceKm < 300) return 1.20;
  return 1.30;
}

export function calcPrezzoSmaltimentoRete(qtyML: number): number {
  return 100 + Math.ceil(Math.max(0, qtyML - 500) / 500) * 50;
}

function pickRentalPrice(rental: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number }, durationMonths: number): number {
  if (durationMonths <= 2) return rental.months_1_2;
  if (durationMonths <= 5) return rental.months_3_5;
  if (durationMonths <= 8) return rental.months_6_8;
  return rental.months_9_plus;
}

export function calculateDynamicServicePrice(
  service: DynamicServiceEntry,
  article: ArticleForPricing,
  distanceKm: number,
  context?: { reteAntipolvereQtyML?: number; durationMonths?: number }
): number {
  let basePrice = 0;
  const durationMonths = context?.durationMonths ?? 1;

  if (service.serviceType === 'mounting') {
    if (service.variantIndex !== undefined && article.variantsData) {
      const variant = article.variantsData[service.variantIndex];
      if (variant?.installation) {
        basePrice = (variant.installation.mount || 0) + (variant.installation.dismount || 0);
      }
    } else {
      const options = article.installationData as Array<{ label: string; mount: number; dismount: number; isDefault?: boolean }> | null;
      if (options && options.length > 0) {
        const defaultOpt = options.find(o => o.isDefault) || options[0];
        basePrice = (defaultOpt.mount || 0) + (defaultOpt.dismount || 0);
      } else if (article.pricingData?.price !== undefined) {
        basePrice = article.pricingData.price;
      } else {
        basePrice = parseFloat(article.basePrice) || 0;
      }
    }

    if (service.applyTrasferta) {
      basePrice *= getTrasfertaMultiplier(distanceKm);
    }
  } else {
    if (service.variantIndex !== undefined && article.variantsData) {
      const variant = article.variantsData[service.variantIndex];
      const variantHasRentalPrices = variant?.rental && (
        variant.rental.months_1_2 || variant.rental.months_3_5 || 
        variant.rental.months_6_8 || variant.rental.months_9_plus
      );
      if (variantHasRentalPrices) {
        basePrice = pickRentalPrice(variant!.rental!, durationMonths);
      } else if (article.pricingData?.months_1_2 !== undefined) {
        basePrice = pickRentalPrice(article.pricingData as any, durationMonths);
      }
    } else {
      if (service.articleCode === 'SRV-004') {
        const qtyML = context?.reteAntipolvereQtyML ?? 0;
        basePrice = calcPrezzoSmaltimentoRete(qtyML);
      } else if (article.pricingLogic === 'SERVICE' || (article.pricingLogic as string) === 'EXTRA') {
        basePrice = article.pricingData?.price ?? (parseFloat(article.basePrice) || 0);
      } else if (article.pricingLogic === 'SALE') {
        basePrice = article.pricingData?.price ?? (parseFloat(article.basePrice) || 0);
      } else if (article.pricingData?.months_1_2 !== undefined) {
        basePrice = pickRentalPrice(article.pricingData as any, durationMonths);
      } else {
        basePrice = parseFloat(article.basePrice) || 0;
      }
    }
  }

  return basePrice;
}

const LEGACY_ID_MAP: Record<string, string> = {
  'rete_posa': 'NOL-010_mounting',
  'rete_fornitura': 'NOL-010_rental',
  'rete_smaltimento': 'SRV-004_rental',
  'relazione_calcolo': 'SRV-002_rental',
  'allarme_installazione': 'NOL-011_mounting',
  'allarme_nolo': 'NOL-011_rental',
  'tubo_tavolone_ms': 'NOL-017_v2_mounting',
  'mensole_sbalzo_ms': 'NOL-017_v0_mounting',
  'mensole_sbalzo_nolo': 'NOL-017_v0_rental',
  'mantovana_ms': 'NOL-003_mounting',
  'mantovana_nolo': 'NOL-003_rental',
  'parapetti_tubo_ms': 'NOL-006_mounting',
  'parapetti_tubo_nolo': 'NOL-006_rental',
  'piani_carico_ms': 'NOL-004_mounting',
  'piani_carico_nolo': 'NOL-004_rental',
  'trasporto_ritiro_esubero': 'SRV-005_rental',
  'controllo_semestrale': 'SRV-006_rental',
  'lavori_economia': 'SRV-003_mounting',
  'interventi_intermedi': 'SRV-003_rental',
  'montacarichi_pm_m10_medium': 'SRV-MC-M10-MED_rental',
  'montacarichi_pm_m10_big': 'SRV-MC-M10-BIG_rental',
  'montacarichi_pm_m20': 'SRV-MC-M20_rental',
  'montacarichi_nolo': 'SRV-MC-NOLO_rental',
};

export function migrateLegacyServiceIds(ids: string[]): string[] {
  return ids.map(id => LEGACY_ID_MAP[id] || id);
}
