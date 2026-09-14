# AdSpy live search + pagination v2

Primary Meta flow:
- advertiser suggestions: live Meta Page Search, local index fallback
- page 1: live Meta Ad Library via SearchAPI
- page size: 25
- page N: POST with `next_page_token`
- authoritative total comes from `search_information.total_results`
- current page contains full structured ad metadata
- existing indexed search remains fallback if the live provider is unavailable

SearchAPI documents `page_id`, `total_results`, and `next_page_token`; it recommends POST for later pages because pagination tokens can become large.

Required environment:
- `SEARCHAPI_API_KEY`

Replace the existing files at the same paths with the files in this bundle.
