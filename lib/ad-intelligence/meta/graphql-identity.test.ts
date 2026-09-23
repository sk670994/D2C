import { describe, expect, it } from "vitest";

import { mergeMetaIdentity, scanMetaIdentity } from "./graphql-identity";

// Trimmed from a real Ad Library response (structure preserved).
const DIRECT =
  '{"ad_library_main":{"search_results_connection":{"count":768,"edges":[{"node":{"collated_results":[' +
  '{"ad_archive_id":"1704700940792108","collation_count":3,"collation_id":"1344642543967112","is_active":true,' +
  '"page_id":"619181354927737","page_is_deleted":false,"snapshot":{"page_id":"619181354927737","page_is_deleted":false,' +
  '"page_profile_uri":"https:\\/\\/www.facebook.com\\/Mamaearthindia\\/","page_name":"Mamaearth","body":{"text":"x"}}},' +
  '{"ad_archive_id":"1053972904197815","collation_count":null,"collation_id":null,"is_active":false,' +
  '"page_id":"619181354927737","snapshot":{"page_id":"619181354927737","page_profile_uri":"https:\\/\\/www.facebook.com\\/Mamaearthindia\\/","page_name":"Mamaearth"}}' +
  "]}}]}}}";

// Partnership ad: the snapshot is posted by a creator page, the advertiser is the top-level page_id.
const BRANDED =
  '{"ad_archive_id":"999000111","collation_count":1,"collation_id":"555","is_active":true,"page_id":"619181354927737",' +
  '"snapshot":{"branded_content":{"page_id":"619181354927737","page_profile_uri":"https:\\/\\/www.facebook.com\\/Mamaearthindia\\/","page_name":"Mamaearth"},' +
  '"page_id":"528733020321862","page_profile_uri":"https:\\/\\/www.facebook.com\\/creator\\/","page_name":"Some Creator"}}';

describe("scanMetaIdentity", () => {
  it("reads page id, status, collation and total count", () => {
    const scan = scanMetaIdentity(DIRECT);
    expect(scan.totalCount).toBe(768);
    expect(scan.ads.size).toBe(2);

    const first = scan.ads.get("1704700940792108")!;
    expect(first.pageId).toBe("619181354927737");
    expect(first.pageName).toBe("Mamaearth");
    expect(first.pageProfileUri).toBe("https://www.facebook.com/Mamaearthindia/");
    expect(first.isActive).toBe(true);
    expect(first.collationId).toBe("1344642543967112");
    expect(first.collationCount).toBe(3);

    const second = scan.ads.get("1053972904197815")!;
    expect(second.isActive).toBe(false);
    expect(second.collationId).toBeNull();
  });

  it("uses the advertiser page (not the creator page) for partnership ads", () => {
    const ad = scanMetaIdentity(BRANDED).ads.get("999000111")!;
    expect(ad.pageId).toBe("619181354927737");
    expect(ad.pageName).toBe("Mamaearth");
  });

  it("returns nothing for unrelated text", () => {
    const scan = scanMetaIdentity("<html>no ads here</html>");
    expect(scan.ads.size).toBe(0);
    expect(scan.totalCount).toBeNull();
  });

  it("merges later scans without erasing known values", () => {
    const acc = scanMetaIdentity(DIRECT);
    mergeMetaIdentity(acc, scanMetaIdentity('{"ad_archive_id":"1704700940792108","is_active":false}'));
    const ad = acc.ads.get("1704700940792108")!;
    expect(ad.isActive).toBe(false);
    expect(ad.pageId).toBe("619181354927737");
    expect(acc.totalCount).toBe(768);
  });
});
