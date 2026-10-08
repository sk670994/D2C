// No imports: next.config.ts reads this file directly.
/**
 * Old SEO URLs merged into stronger pages (301). Thin near-duplicates hurt
 * rankings; one deep page per intent ranks better than five shallow ones.
 */
export const SEO_REDIRECTS: Array<[from: string, to: string]> = [
  ["/meta-ad-library", "/meta-ad-library-india"],
  ["/facebook-ad-library", "/meta-ad-library-india"],
  ["/instagram-ad-library", "/meta-ad-library-india"],
  ["/meta-ad-library-competitor-research", "/meta-ad-library-india"],
  ["/competitor-ad-research", "/competitor-ad-intelligence"],
  ["/d2c-ad-intelligence", "/competitor-ad-intelligence"],
  ["/guides/meta-ad-library-for-d2c", "/guides/how-to-use-meta-ad-library"],
  ["/guides/facebook-ad-library-research", "/guides/how-to-use-meta-ad-library"],
  ["/guides/instagram-ad-research", "/guides/how-to-find-competitor-ads"],
  ["/guides/how-to-research-d2c-competitors", "/guides/how-to-analyze-competitor-ads"],
  ["/guides/how-to-monitor-competitor-offers", "/guides/how-to-monitor-competitor-ads"],
  ["/research/d2c-offer-trends-2026", "/research/india-d2c-advertising-report-2026"],
  ["/research/meta-advertising-india-2026", "/research/india-d2c-advertising-report-2026"],
  ["/research/d2c-competitor-ad-trends", "/research/india-d2c-advertising-report-2026"],
];
