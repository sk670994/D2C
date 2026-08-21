import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  metaProvider,
} from "@/lib/ad-intelligence/providers/meta";

import {
  buildAdSearchSummary,
  enrichAds,
  rankAds,
} from "@/lib/ad-intelligence/intelligence";

export const runtime =
  "nodejs";

export async function GET(
  request: NextRequest
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    const query =
      searchParams
        .get("q")
        ?.trim() ??
      "Mamaearth";

    const country =
      (
        searchParams.get(
          "country"
        ) ??
        "IN"
      )
        .trim()
        .toUpperCase();

    const requestedLimit =
      Number(
        searchParams.get(
          "limit"
        ) ??
        "100"
      );

    const limit =
      Number.isFinite(
        requestedLimit
      ) &&
      requestedLimit > 0
        ? Math.min(
            Math.floor(
              requestedLimit
            ),
            200
          )
        : 100;

    const providerResult =
      await metaProvider.search(
        {
          query,

          country,

          platform:
            "meta",

          mode:
            "keyword",

          page: 1,

          limit,
        }
      );

    const enriched =
      enrichAds(
        providerResult.ads,
        query
      );

    const ranked =
      rankAds(
        enriched
      );

    const summary =
      buildAdSearchSummary(
        ranked
      );

    return NextResponse.json({
      success:
        true,

      query,

      country,

      mode:
        "keyword",

      count:
        ranked.length,

      summary,

      ads:
        ranked,
    });
  } catch (
    error
  ) {
    console.error(
      "[TestMeta] Failed:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error instanceof
          Error
            ? error.message
            : "Meta test failed.",
      },
      {
        status: 500,
      }
    );
  }
}