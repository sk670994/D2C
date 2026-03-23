import type { ParsedReport } from "@/lib/types/domain";

type ShopifyConnectorPayload = {
  sellingPrice?: number;
  discount?: number;
  gstRate?: number;
  cogs?: number;
  cogsBreakdown?: number[];
  shipping?: number;
  codFee?: number;
  paymentGatewayPct?: number;
  returnsRate?: number;
  returns?: number;
  orders?: number;
  returnShipping?: number;
  warehouse?: number;
};

type AdConnectorPayload = {
  totalAdSpend?: number;
  impressions?: number;
  clicks?: number;
  orders?: number;
  revenue?: number;
};

export type ConnectorPayload = {
  shopify?: ShopifyConnectorPayload;
  ads?: AdConnectorPayload;
  meta?: AdConnectorPayload;
  google?: AdConnectorPayload;
  channels?: Record<string, AdConnectorPayload>;
  scalePlanner?: Partial<ParsedReport["scalePlannerInput"]>;
};

function toFinite(value?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toPercent(value?: number): number | undefined {
  const normalized = toFinite(value);
  if (normalized === undefined) return undefined;
  if (Math.abs(normalized) > 1) {
    return normalized / 100;
  }
  return Math.max(0, normalized);
}

function applyShopifyPayload(payload: ShopifyConnectorPayload, input: ParsedReport): ParsedReport {
  const base = input.unitEconomicsInput;
  const baseAd = input.adMetricsInput;
  const totalCogs = toFinite(payload.cogs);
  const hasBreakdown = Array.isArray(payload.cogsBreakdown) && payload.cogsBreakdown.length >= 1;
  const nextCogsParts = base.cogsParts.map((part, index) => {
    if (hasBreakdown && typeof payload.cogsBreakdown?.[index] === "number") {
      return payload.cogsBreakdown[index];
    }
    if (index === 0 && totalCogs !== undefined) {
      return totalCogs;
    }
    return part;
  });

  const returnsRatio =
    toFinite(payload.returnsRate) ??
    (toFinite(payload.returns) !== undefined && toFinite(payload.orders) !== undefined
      ? Math.min(Math.max(payload.returns! / payload.orders!, 0), 1)
      : undefined);

  const updatedAdMetrics: ParsedReport["adMetricsInput"] = {
    ...baseAd,
    revenue: toFinite(payload.revenue) ?? baseAd.revenue,
    orders: toFinite(payload.orders) ?? baseAd.orders
  };

  return {
    ...input,
    unitEconomicsInput: {
      ...base,
      sellingPrice: toFinite(payload.sellingPrice) ?? base.sellingPrice,
      discount: toFinite(payload.discount) ?? base.discount,
      gstRate: toFinite(payload.gstRate) ?? base.gstRate,
      cogsParts: nextCogsParts,
      shipping: toFinite(payload.shipping) ?? base.shipping,
      codFee: toFinite(payload.codFee) ?? base.codFee,
      paymentGatewayPct: toPercent(payload.paymentGatewayPct) ?? base.paymentGatewayPct,
      returnsRate: returnsRatio ?? base.returnsRate,
      returnShipping: toFinite(payload.returnShipping) ?? base.returnShipping,
      warehouse: toFinite(payload.warehouse) ?? base.warehouse
    },
    adMetricsInput: updatedAdMetrics
  };
}

function applyAdsPayload(payload: AdConnectorPayload, input: ParsedReport): ParsedReport {
  const base = input.adMetricsInput;
  return {
    ...input,
    adMetricsInput: {
      ...base,
      totalAdSpend: toFinite(payload.totalAdSpend) ?? base.totalAdSpend,
      impressions: toFinite(payload.impressions) ?? base.impressions,
      clicks: toFinite(payload.clicks) ?? base.clicks,
      orders: toFinite(payload.orders) ?? base.orders,
      revenue: toFinite(payload.revenue) ?? base.revenue
    }
  };
}

export function applyConnectorPayload(payload: ConnectorPayload, current: ParsedReport): ParsedReport {
  let next = current;
  if (payload.shopify) {
    next = applyShopifyPayload(payload.shopify, next);
  }

  const adPayloads: AdConnectorPayload[] = [];
  if (payload.ads) adPayloads.push(payload.ads);
  if (payload.meta) adPayloads.push(payload.meta);
  if (payload.google) adPayloads.push(payload.google);
  if (payload.channels) {
    Object.values(payload.channels).forEach((entry) => {
      if (entry) adPayloads.push(entry);
    });
  }
  adPayloads.forEach((entry) => {
    next = applyAdsPayload(entry, next);
  });

  if (payload.scalePlanner) {
    next = {
      ...next,
      scalePlannerInput: {
        ...next.scalePlannerInput,
        ...payload.scalePlanner
      }
    };
  }

  return next;
}

export const SAMPLE_CONNECTOR_PAYLOADS: Record<string, ConnectorPayload> = {
  shopify: {
    shopify: {
      sellingPrice: 1499,
      discount: 120,
      gstRate: 0.18,
      cogs: 420,
      shipping: 95,
      codFee: 32,
      paymentGatewayPct: 2.1,
      returnsRate: 0.075,
      returnShipping: 65,
      warehouse: 28,
      orders: 840,
      revenue: 1120000
    },
    scalePlanner: {
      revenueGrowthTargetPct: 0.25,
      adSpendGrowthTargetPct: 0.2,
      ordersGrowthTargetPct: 0.2,
      cacImprovementTargetPct: -0.08,
      allocationMetaPct: 0.58,
      allocationGooglePct: 0.32,
      allocationOtherPct: 0.1
    }
  },
  ads: {
    ads: {
      totalAdSpend: 238000,
      impressions: 3600000,
      clicks: 118000,
      orders: 820,
      revenue: 1120000
    }
  },
  combined: {
    shopify: {
      sellingPrice: 1499,
      discount: 120,
      gstRate: 0.18,
      cogs: 420,
      shipping: 95,
      codFee: 32,
      paymentGatewayPct: 2.1,
      returnsRate: 0.075,
      returnShipping: 65,
      warehouse: 28,
      orders: 840,
      revenue: 1120000
    },
    ads: {
      totalAdSpend: 238000,
      impressions: 3600000,
      clicks: 118000,
      orders: 820,
      revenue: 1120000
    },
    scalePlanner: {
      revenueGrowthTargetPct: 0.25,
      adSpendGrowthTargetPct: 0.2,
      ordersGrowthTargetPct: 0.2,
      cacImprovementTargetPct: -0.08,
      allocationMetaPct: 0.58,
      allocationGooglePct: 0.32,
      allocationOtherPct: 0.1
    }
  }
};
