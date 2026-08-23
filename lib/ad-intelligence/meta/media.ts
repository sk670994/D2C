/* =========================================================
 * META MEDIA UTILITIES
 *
 * IMPORTANT:
 * These helpers are Node-safe / browser-context-safe.
 *
 * They DO NOT reference:
 * document
 * window
 * Element
 * HTMLElement
 * NodeFilter
 *
 * DOM extraction stays inside page.evaluate() for now.
 * These utilities operate on the extracted media values.
 * ======================================================= */

export type MetaMediaInput = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;

  hasVideo?: boolean;
  hasImage?: boolean;
  hasCarousel?: boolean;

  videoDurationSeconds?: number | null;

  imageWidth?: number | null;
  imageHeight?: number | null;

  videoWidth?: number | null;
  videoHeight?: number | null;
};

export type MetaMediaResult = {
  hasVideo: boolean;
  hasImage: boolean;
  hasCarousel: boolean;

  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;

  videoDurationSeconds: number | null;

  imageWidth: number | null;
  imageHeight: number | null;

  videoWidth: number | null;
  videoHeight: number | null;
};

/* =========================================================
 * NUMBER HELPERS
 * ======================================================= */

function normalizePositiveNumber(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

/* =========================================================
 * URL HELPERS
 * ======================================================= */

function normalizeMediaUrl(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const text =
    value.trim();

  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString();
  } catch {
    /*
     * Keep relative / unusual media URLs rather
     * than destroying data we successfully extracted.
     */
    return text;
  }
}

/* =========================================================
 * CREATIVE TYPE SIGNALS
 * ======================================================= */

export function inferHasVideo(
  input: MetaMediaInput,
): boolean {
  if (input.hasVideo === true) {
    return true;
  }

  return Boolean(
    normalizeMediaUrl(
      input.videoUrl,
    ),
  );
}

export function inferHasImage(
  input: MetaMediaInput,
): boolean {
  if (input.hasImage === true) {
    return true;
  }

  return Boolean(
    normalizeMediaUrl(
      input.imageUrl,
    ),
  );
}

export function inferHasCarousel(
  input: MetaMediaInput,
): boolean {
  return input.hasCarousel === true;
}

/* =========================================================
 * VIDEO DURATION
 * ======================================================= */

export function normalizeVideoDuration(
  value: unknown,
): number | null {
  const duration =
    normalizePositiveNumber(
      value,
    );

  if (duration === null) {
    return null;
  }

  /*
   * Meta media duration should be measured in seconds.
   * Round only after validating the value.
   */
  return Math.round(duration);
}

/* =========================================================
 * MEDIA NORMALIZATION
 * ======================================================= */

export function normalizeMetaMedia(
  input: MetaMediaInput,
): MetaMediaResult {
  const imageUrl =
    normalizeMediaUrl(
      input.imageUrl,
    );

  const videoUrl =
    normalizeMediaUrl(
      input.videoUrl,
    );

  const thumbnailUrl =
    normalizeMediaUrl(
      input.thumbnailUrl,
    ) ??
    imageUrl;

  const hasVideo =
    inferHasVideo(input) ||
    Boolean(videoUrl);

  const hasImage =
    inferHasImage(input) ||
    Boolean(imageUrl);

  const hasCarousel =
    inferHasCarousel(input);

  return {
    hasVideo,
    hasImage,
    hasCarousel,

    imageUrl,
    videoUrl,
    thumbnailUrl,

    videoDurationSeconds:
      normalizeVideoDuration(
        input.videoDurationSeconds,
      ),

    imageWidth:
      normalizePositiveNumber(
        input.imageWidth,
      ),

    imageHeight:
      normalizePositiveNumber(
        input.imageHeight,
      ),

    videoWidth:
      normalizePositiveNumber(
        input.videoWidth,
      ),

    videoHeight:
      normalizePositiveNumber(
        input.videoHeight,
      ),
  };
}

/* =========================================================
 * CREATIVE TYPE
 * ======================================================= */

export function inferMediaCreativeType(
  input: MetaMediaInput,
): "image" | "video" | "carousel" | "unknown" {
  if (
    input.hasVideo ||
    input.videoUrl
  ) {
    return "video";
  }

  if (
    input.hasCarousel
  ) {
    return "carousel";
  }

  if (
    input.hasImage ||
    input.imageUrl
  ) {
    return "image";
  }

  return "unknown";
}

/* =========================================================
 * VIDEO SIGNALS
 * ======================================================= */

export type VideoSignals = {
  hasVideo: boolean;

  durationSeconds: number | null;

  hasThumbnail: boolean;

  aspectRatio: number | null;

  isVertical: boolean;
  isHorizontal: boolean;
  isSquare: boolean;
};

export function getVideoSignals(
  input: MetaMediaInput,
): VideoSignals {
  const normalized =
    normalizeMetaMedia(input);

  const width =
    normalized.videoWidth;

  const height =
    normalized.videoHeight;

  const aspectRatio =
    width !== null &&
    height !== null &&
    height > 0
      ? width / height
      : null;

  return {
    hasVideo:
      normalized.hasVideo,

    durationSeconds:
      normalized.videoDurationSeconds,

    hasThumbnail:
      Boolean(
        normalized.thumbnailUrl,
      ),

    aspectRatio,

    isVertical:
      aspectRatio !== null &&
      aspectRatio < 0.9,

    isHorizontal:
      aspectRatio !== null &&
      aspectRatio > 1.1,

    isSquare:
      aspectRatio !== null &&
      aspectRatio >= 0.9 &&
      aspectRatio <= 1.1,
  };
}

/* =========================================================
 * IMAGE SIGNALS
 * ======================================================= */

export type ImageSignals = {
  hasImage: boolean;

  width: number | null;
  height: number | null;

  aspectRatio: number | null;

  isVertical: boolean;
  isHorizontal: boolean;
  isSquare: boolean;
};

export function getImageSignals(
  input: MetaMediaInput,
): ImageSignals {
  const normalized =
    normalizeMetaMedia(input);

  const width =
    normalized.imageWidth;

  const height =
    normalized.imageHeight;

  const aspectRatio =
    width !== null &&
    height !== null &&
    height > 0
      ? width / height
      : null;

  return {
    hasImage:
      normalized.hasImage,

    width,
    height,

    aspectRatio,

    isVertical:
      aspectRatio !== null &&
      aspectRatio < 0.9,

    isHorizontal:
      aspectRatio !== null &&
      aspectRatio > 1.1,

    isSquare:
      aspectRatio !== null &&
      aspectRatio >= 0.9 &&
      aspectRatio <= 1.1,
  };
}

/* =========================================================
 * MEDIA QUALITY
 * ======================================================= */

export function calculateMediaQualityScore(
  input: MetaMediaInput,
): number {
  const media =
    normalizeMetaMedia(input);

  let score = 40;

  if (media.hasVideo) {
    score += 20;
  }

  if (media.hasCarousel) {
    score += 10;
  }

  if (
    media.thumbnailUrl
  ) {
    score += 5;
  }

  if (
    media.videoDurationSeconds !==
      null &&
    media.videoDurationSeconds > 3
  ) {
    score += 5;
  }

  if (
    media.imageWidth !== null &&
    media.imageHeight !== null
  ) {
    score += 5;
  }

  if (
    media.videoWidth !== null &&
    media.videoHeight !== null
  ) {
    score += 5;
  }

  return Math.min(
    100,
    score,
  );
}