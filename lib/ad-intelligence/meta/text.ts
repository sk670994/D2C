export function cleanText(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

export function repairMojibake(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  if (
    !/[ÃÂà¤à¥]/.test(value) &&
    !value.includes("�")
  ) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(
      Array.from(
        value,
        (character) =>
          character.charCodeAt(0) & 0xff,
      ),
    );

    const repaired = new TextDecoder(
      "utf-8",
      {
        fatal: false,
      },
    ).decode(bytes);

    if (
      repaired &&
      repaired !== value &&
      !repaired.includes("�")
    ) {
      return repaired;
    }
  } catch {
    // Keep original text.
  }

  return value;
}

export function normalizeExtractedText(
  value: unknown,
): string | null {
  return repairMojibake(
    cleanText(value),
  );
}

export function normalizeWhitespace(
  value?: string | null,
): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}