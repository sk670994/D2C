import type {
  CompetitorAd,
} from "../types";

/* =========================================================
 * VIDEO INTELLIGENCE
 *
 * Pure analysis of already-extracted video ad metadata.
 *
 * This module does NOT:
 * - download videos
 * - run ffmpeg
 * - perform speech-to-text
 * - modify the Meta scraper
 *
 * It analyzes the information already available on
 * CompetitorAd and provides structured video signals.
 * ======================================================= */

export type VideoTranscriptStatus =
  | "available"
  | "pending"
  | "failed"
  | "unavailable"
  | "not_video";

export type VideoHookType =
  | "offer"
  | "product"
  | "problem"
  | "benefit"
  | "curiosity"
  | "social_proof"
  | "urgency"
  | "unknown";

export type VideoAnalysis = {
  adId: string;

  isVideo: boolean;

  videoUrl: string | null;

  thumbnailUrl: string | null;

  durationSeconds: number | null;

  durationBucket:
    | "short"
    | "medium"
    | "long"
    | "unknown";

  transcriptStatus:
    VideoTranscriptStatus;

  transcript: string | null;

  transcriptAvailable: boolean;

  transcriptPending: boolean;

  spokenHook: string | null;

  detectedHookType:
    VideoHookType;

  spokenCta: string | null;

  creatorPresenceDetected: boolean;

  ugcDetected: boolean;

  productMentionDetected: boolean;

  offerMentionDetected: boolean;

  urgencyMentionDetected: boolean;

  socialProofDetected: boolean;

  analysisConfidence: number;

  evidence: string[];
};

export type VideoAnalysisSummary = {
  totalAds: number;

  videoAds: number;

  videoShare: number;

  videosWithTranscript: number;

  videosPendingTranscript: number;

  videosWithCreatorSignal: number;

  averageDurationSeconds: number;

  shortVideos: number;

  mediumVideos: number;

  longVideos: number;

  hookTypes: Record<
    VideoHookType,
    number
  >;

  topHookType: VideoHookType;

  analyzedVideos:
    VideoAnalysis[];
};

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

function normalizeText(
  value:
    | string
    | null
    | undefined,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLower(
  value:
    | string
    | null
    | undefined,
): string {
  return normalizeText(
    value,
  ).toLowerCase();
}

/* =========================================================
 * VIDEO DETECTION
 * ======================================================= */

export function isVideoAd(
  ad: CompetitorAd,
): boolean {
  return (
    ad.creativeType ===
      "video" ||
    Boolean(ad.videoUrl)
  );
}

/* =========================================================
 * TRANSCRIPT STATUS
 * ======================================================= */

function getTranscriptStatus(
  ad: CompetitorAd,
): VideoTranscriptStatus {
  if (
    !isVideoAd(ad)
  ) {
    return "not_video";
  }

  switch (
    ad.transcriptStatus
  ) {
    case "available":
      return "available";

    case "pending":
      return "pending";

    case "failed":
      return "failed";

    case "unavailable":
      return "unavailable";

    case "not_video":
      return "not_video";

    default:
      if (
        ad.transcript
      ) {
        return "available";
      }

      return "unavailable";
  }
}

/* =========================================================
 * VIDEO URL
 * ======================================================= */

function getVideoUrl(
  ad: CompetitorAd,
): string | null {
  const value =
    ad.videoUrl;

  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

function getThumbnailUrl(
  ad: CompetitorAd,
): string | null {
  const value =
    ad.thumbnailUrl;

  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

/* =========================================================
 * DURATION
 * ======================================================= */

function getDurationBucket(
  durationSeconds:
    | number
    | null,
):
  | "short"
  | "medium"
  | "long"
  | "unknown" {
  if (
    durationSeconds ===
      null ||
    !Number.isFinite(
      durationSeconds,
    ) ||
    durationSeconds <= 0
  ) {
    return "unknown";
  }

  if (
    durationSeconds <= 15
  ) {
    return "short";
  }

  if (
    durationSeconds <= 45
  ) {
    return "medium";
  }

  return "long";
}

/* =========================================================
 * METADATA
 * ======================================================= */

function getMetadata(
  ad: CompetitorAd,
): Record<
  string,
  unknown
> | null {
  if (
    !ad.metadata ||
    typeof ad.metadata !==
      "object"
  ) {
    return null;
  }

  return ad.metadata as Record<
    string,
    unknown
  >;
}

function getMetadataBoolean(
  ad: CompetitorAd,
  keys: string[],
): boolean {
  const metadata =
    getMetadata(ad);

  if (!metadata) {
    return false;
  }

  return keys.some(
    (key) =>
      metadata[key] ===
      true,
  );
}

/* =========================================================
 * TEXT SOURCES
 * ======================================================= */

function buildAnalysisText(
  ad: CompetitorAd,
): string {
  const parts = [
    ad.transcript,
    ad.primaryText,
    ad.headline,
    ad.description,
    ad.offer,
    ad.productName,
  ];

  return normalizeText(
    parts
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value &&
              value.trim(),
          ),
      )
      .join(" "),
  );
}

/* =========================================================
 * TRANSCRIPT
 * ======================================================= */

function getTranscript(
  ad: CompetitorAd,
): string | null {
  const transcript =
    normalizeText(
      ad.transcript,
    );

  return transcript ||
    null;
}

/* =========================================================
 * KEYWORD MATCHING
 * ======================================================= */

function containsAny(
  text: string,
  patterns: string[],
): boolean {
  return patterns.some(
    (pattern) =>
      text.includes(
        pattern,
      ),
  );
}

/* =========================================================
 * OFFER SIGNAL
 * ======================================================= */

function detectOfferMention(
  ad: CompetitorAd,
  text: string,
): boolean {
  if (ad.offer) {
    return true;
  }

  return containsAny(
    normalizeLower(text),
    [
      "%",
      "off",
      "discount",
      "sale",
      "save",
      "deal",
      "free shipping",
      "free delivery",
      "coupon",
      "promo",
      "offer",
      "limited offer",
      "code",
    ],
  );
}

/* =========================================================
 * URGENCY
 * ======================================================= */

function detectUrgency(
  text: string,
): boolean {
  return containsAny(
    normalizeLower(text),
    [
      "limited time",
      "today only",
      "ends today",
      "ending soon",
      "last chance",
      "don't miss",
      "dont miss",
      "while supplies last",
      "limited stock",
      "act now",
      "hurry",
      "now",
      "ends soon",
    ],
  );
}

/* =========================================================
 * SOCIAL PROOF
 * ======================================================= */

function detectSocialProof(
  text: string,
): boolean {
  return containsAny(
    normalizeLower(text),
    [
      "best seller",
      "bestseller",
      "top rated",
      "top-rated",
      "loved by",
      "trusted by",
      "thousands",
      "millions",
      "customers love",
      "customer favorite",
      "rated",
      "reviews",
      "five star",
      "5 star",
    ],
  );
}

/* =========================================================
 * PRODUCT MENTION
 * ======================================================= */

function detectProductMention(
  ad: CompetitorAd,
  text: string,
): boolean {
  const product =
    normalizeLower(
      ad.productName,
    );

  if (!product) {
    return false;
  }

  if (
    text.includes(product)
  ) {
    return true;
  }

  return Boolean(
    ad.headline ||
      ad.productName,
  );
}

/* =========================================================
 * CREATOR / UGC SIGNAL
 * ======================================================= */

function detectCreatorPresence(
  ad: CompetitorAd,
): boolean {
  if (
    ad.creatorName
  ) {
    return true;
  }

  return getMetadataBoolean(
    ad,
    [
      "creatorPresent",
      "creatorDetected",
      "influencerDetected",
      "ugcDetected",
      "personDetected",
    ],
  );
}

function detectUGC(
  ad: CompetitorAd,
): boolean {
  return getMetadataBoolean(
    ad,
    [
      "ugcDetected",
      "userGeneratedContent",
      "ugc",
    ],
  );
}

/* =========================================================
 * HOOK DETECTION
 * ======================================================= */

function detectHookType(
  ad: CompetitorAd,
  transcript:
    | string
    | null,
  analysisText: string,
): VideoHookType {
  const text =
    normalizeLower(
      transcript ||
        analysisText,
    );

  /*
   * Offer-first hook.
   */
  if (
    detectOfferMention(
      ad,
      text,
    )
  ) {
    return "offer";
  }

  /*
   * Urgency.
   */
  if (
    detectUrgency(text)
  ) {
    return "urgency";
  }

  /*
   * Social proof.
   */
  if (
    detectSocialProof(text)
  ) {
    return "social_proof";
  }

  /*
   * Problem / pain.
   */
  if (
    containsAny(
      text,
      [
        "tired of",
        "struggling with",
        "problem",
        "pain",
        "never again",
        "stop",
        "avoid",
        "frustrated",
        "hard to",
        "difficult",
      ],
    )
  ) {
    return "problem";
  }

  /*
   * Benefit.
   */
  if (
    containsAny(
      text,
      [
        "better",
        "faster",
        "easier",
        "more comfortable",
        "more powerful",
        "lightweight",
        "breathable",
        "premium",
        "designed to",
        "helps you",
      ],
    )
  ) {
    return "benefit";
  }

  /*
   * Product.
   */
  if (
    ad.productName ||
    ad.headline
  ) {
    return "product";
  }

  /*
   * Curiosity.
   */
  if (
    containsAny(
      text,
      [
        "discover",
        "see why",
        "find out",
        "you won't believe",
        "you won't",
        "what happens",
        "why",
        "secret",
      ],
    )
  ) {
    return "curiosity";
  }

  return "unknown";
}

/* =========================================================
 * SPOKEN HOOK
 *
 * Until actual transcription is available, use the
 * first meaningful sentence from the extracted copy.
 * ======================================================= */

function extractSpokenHook(
  ad: CompetitorAd,
  transcript:
    | string
    | null,
): string | null {
  if (transcript) {
    const sentence =
      transcript
        .split(
          /(?<=[.!?])\s+/,
        )[0]
        ?.trim();

    return (
      sentence ||
      transcript.slice(
        0,
        180,
      )
    );
  }

  const fallback =
    normalizeText(
      ad.primaryText ||
        ad.headline ||
        ad.productName,
    );

  if (!fallback) {
    return null;
  }

  const sentence =
    fallback
      .split(
        /(?<=[.!?])\s+/,
      )[0]
      ?.trim();

  return (
    sentence ||
    fallback.slice(
      0,
      180,
    )
  );
}

/* =========================================================
 * SPOKEN CTA
 * ======================================================= */

function extractSpokenCta(
  ad: CompetitorAd,
  transcript:
    | string
    | null,
): string | null {
  const cta =
    normalizeText(
      ad.callToAction,
    );

  if (cta) {
    return cta;
  }

  if (!transcript) {
    return null;
  }

  const normalized =
    normalizeLower(
      transcript,
    );

  const matches = [
    "shop now",
    "learn more",
    "sign up",
    "buy now",
    "download",
    "get started",
    "try it",
    "discover more",
  ];

  const found =
    matches.find(
      (candidate) =>
        normalized.includes(
          candidate,
        ),
    );

  return found
    ? found
    : null;
}

/* =========================================================
 * CONFIDENCE
 * ======================================================= */

function calculateConfidence(
  ad: CompetitorAd,
  transcript:
    | string
    | null,
  transcriptStatus:
    VideoTranscriptStatus,
): number {
  let score = 20;

  if (
    getVideoUrl(ad)
  ) {
    score += 15;
  }

  if (
    ad.videoDurationSeconds &&
    ad.videoDurationSeconds >
      0
  ) {
    score += 15;
  }

  if (
    transcriptStatus ===
    "available"
  ) {
    score += 35;
  }

  if (
    transcript &&
    transcript.length >= 20
  ) {
    score += 10;
  }

  if (
    detectCreatorPresence(
      ad,
    )
  ) {
    score += 5;
  }

  return Math.min(
    100,
    score,
  );
}

/* =========================================================
 * ANALYZE ONE VIDEO
 * ======================================================= */

export function analyzeVideoAd(
  ad: CompetitorAd,
): VideoAnalysis {
  const isVideo =
    isVideoAd(ad);

  const transcriptStatus =
    getTranscriptStatus(
      ad,
    );

  const transcript =
    isVideo
      ? getTranscript(ad)
      : null;

  const analysisText =
    buildAnalysisText(
      ad,
    );

  const spokenHook =
    isVideo
      ? extractSpokenHook(
          ad,
          transcript,
        )
      : null;

  const detectedHookType =
    isVideo
      ? detectHookType(
          ad,
          transcript,
          analysisText,
        )
      : "unknown";

  const spokenCta =
    isVideo
      ? extractSpokenCta(
          ad,
          transcript,
        )
      : null;

  const creatorPresenceDetected =
    isVideo &&
    detectCreatorPresence(
      ad,
    );

  const ugcDetected =
    isVideo &&
    detectUGC(ad);

  const productMentionDetected =
    isVideo &&
    detectProductMention(
      ad,
      analysisText,
    );

  const offerMentionDetected =
    isVideo &&
    detectOfferMention(
      ad,
      analysisText,
    );

  const urgencyMentionDetected =
    isVideo &&
    detectUrgency(
      analysisText,
    );

  const socialProofDetected =
    isVideo &&
    detectSocialProof(
      analysisText,
    );

  const evidence: string[] =
    [];

  if (
    getVideoUrl(ad)
  ) {
    evidence.push(
      "Video URL available",
    );
  }

  if (
    ad.videoDurationSeconds
  ) {
    evidence.push(
      `Duration detected: ${ad.videoDurationSeconds}s`,
    );
  }

  if (
    transcriptStatus ===
    "available"
  ) {
    evidence.push(
      "Transcript available",
    );
  }

  if (
    transcriptStatus ===
    "pending"
  ) {
    evidence.push(
      "Transcript pending",
    );
  }

  if (
    creatorPresenceDetected
  ) {
    evidence.push(
      "Creator presence signal detected",
    );
  }

  if (ugcDetected) {
    evidence.push(
      "UGC signal detected",
    );
  }

  if (
    productMentionDetected
  ) {
    evidence.push(
      "Product mention detected",
    );
  }

  if (
    offerMentionDetected
  ) {
    evidence.push(
      "Offer/discount signal detected",
    );
  }

  if (
    urgencyMentionDetected
  ) {
    evidence.push(
      "Urgency signal detected",
    );
  }

  if (
    socialProofDetected
  ) {
    evidence.push(
      "Social proof signal detected",
    );
  }

  if (
    detectedHookType !==
    "unknown"
  ) {
    evidence.push(
      `Hook type: ${detectedHookType}`,
    );
  }

  if (
    spokenCta
  ) {
    evidence.push(
      `CTA: ${spokenCta}`,
    );
  }

  return {
    adId: ad.id,

    isVideo,

    videoUrl:
      getVideoUrl(ad),

    thumbnailUrl:
      getThumbnailUrl(ad),

    durationSeconds:
      ad.videoDurationSeconds ??
      null,

    durationBucket:
      getDurationBucket(
        ad.videoDurationSeconds ??
          null,
      ),

    transcriptStatus,

    transcript,

    transcriptAvailable:
      transcriptStatus ===
      "available",

    transcriptPending:
      transcriptStatus ===
      "pending",

    spokenHook,

    detectedHookType,

    spokenCta,

    creatorPresenceDetected,

    ugcDetected,

    productMentionDetected,

    offerMentionDetected,

    urgencyMentionDetected,

    socialProofDetected,

    analysisConfidence:
      calculateConfidence(
        ad,
        transcript,
        transcriptStatus,
      ),

    evidence,
  };
}

/* =========================================================
 * BATCH ANALYSIS
 * ======================================================= */

export function analyzeVideoAds(
  ads: CompetitorAd[],
): VideoAnalysis[] {
  return ads
    .filter(isVideoAd)
    .map(
      analyzeVideoAd,
    );
}

/* =========================================================
 * AVERAGE
 * ======================================================= */

function average(
  values: number[],
): number {
  if (
    values.length === 0
  ) {
    return 0;
  }

  return (
    values.reduce(
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
    values.length
  );
}

/* =========================================================
 * SUMMARY
 * ======================================================= */

export function summarizeVideoAnalysis(
  ads: CompetitorAd[],
): VideoAnalysisSummary {
  const videoAds =
    analyzeVideoAds(
      ads,
    );

  const totalAds =
    ads.length;

  const videoCount =
    videoAds.length;

  const hookTypes: Record<
    VideoHookType,
    number
  > = {
    offer: 0,
    product: 0,
    problem: 0,
    benefit: 0,
    curiosity: 0,
    social_proof: 0,
    urgency: 0,
    unknown: 0,
  };

  for (
    const analysis of videoAds
  ) {
    hookTypes[
      analysis.detectedHookType
    ] += 1;
  }

  let topHookType:
    VideoHookType =
    "unknown";

  let topHookCount =
    0;

  for (
    const [
      hook,
      count,
    ] of Object.entries(
      hookTypes,
    ) as Array<
      [
        VideoHookType,
        number,
      ]
    >
  ) {
    if (
      count > topHookCount
    ) {
      topHookCount =
        count;

      topHookType =
        hook;
    }
  }

  const durations =
    videoAds
      .map(
        (analysis) =>
          analysis.durationSeconds,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !==
            null &&
          Number.isFinite(
            value,
          ),
      );

  return {
    totalAds,

    videoAds:
      videoCount,

    videoShare:
      totalAds > 0
        ? Math.round(
            (videoCount /
              totalAds) *
              100,
          )
        : 0,

    videosWithTranscript:
      videoAds.filter(
        (analysis) =>
          analysis.transcriptAvailable,
      ).length,

    videosPendingTranscript:
      videoAds.filter(
        (analysis) =>
          analysis.transcriptPending,
      ).length,

    videosWithCreatorSignal:
      videoAds.filter(
        (analysis) =>
          analysis.creatorPresenceDetected,
      ).length,

    averageDurationSeconds:
      Math.round(
        average(
          durations,
        ),
      ),

    shortVideos:
      videoAds.filter(
        (analysis) =>
          analysis.durationBucket ===
          "short",
      ).length,

    mediumVideos:
      videoAds.filter(
        (analysis) =>
          analysis.durationBucket ===
          "medium",
      ).length,

    longVideos:
      videoAds.filter(
        (analysis) =>
          analysis.durationBucket ===
          "long",
      ).length,

    hookTypes,

    topHookType,

    analyzedVideos:
      videoAds,
  };
}

/* =========================================================
 * TRANSCRIPT HELPERS
 * ======================================================= */

export function getVideosPendingTranscript(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      isVideoAd(ad) &&
      getTranscriptStatus(
        ad,
      ) ===
        "pending",
  );
}

export function getVideosWithTranscript(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      isVideoAd(ad) &&
      getTranscriptStatus(
        ad,
      ) ===
        "available",
  );
}

/* =========================================================
 * VIDEO FILTERS
 * ======================================================= */

export function filterVideosByHook(
  ads: CompetitorAd[],
  hookType: VideoHookType,
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeVideoAd(ad)
        .detectedHookType ===
      hookType,
  );
}

export function filterVideosByDuration(
  ads: CompetitorAd[],
  bucket:
    | "short"
    | "medium"
    | "long",
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeVideoAd(ad)
        .durationBucket ===
      bucket,
  );
}

export function filterVideosWithCreatorSignals(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeVideoAd(ad)
        .creatorPresenceDetected,
  );
}

/* =========================================================
 * VIDEO RANKING
 * ======================================================= */

export function rankVideosByIntelligence(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads
    .filter(isVideoAd)
    .sort(
      (a, b) => {
        const aAnalysis =
          analyzeVideoAd(a);

        const bAnalysis =
          analyzeVideoAd(b);

        if (
          bAnalysis.analysisConfidence !==
          aAnalysis.analysisConfidence
        ) {
          return (
            bAnalysis.analysisConfidence -
            aAnalysis.analysisConfidence
          );
        }

        if (
          bAnalysis.transcriptAvailable !==
          aAnalysis.transcriptAvailable
        ) {
          return bAnalysis.transcriptAvailable
            ? 1
            : -1;
        }

        return (
          (b.engagementPotentialScore ??
            0) -
          (a.engagementPotentialScore ??
            0)
        );
      },
    );
}

/* =========================================================
 * DEFAULT
 * ======================================================= */

export default analyzeVideoAd;