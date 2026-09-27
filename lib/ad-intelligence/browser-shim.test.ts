import { describe, expect, it } from "vitest";

import { parseProxyUrl } from "./browser-shim";

describe("parseProxyUrl", () => {
  it("splits credentials from the server", () => {
    expect(parseProxyUrl("http://user:p%40ss@in.proxy.io:8000")).toEqual({ proxy: { server: "http://in.proxy.io:8000", username: "user", password: "p@ss" } });
  });
  it("ignores empty, quoted-empty and bad values", () => {
    expect(parseProxyUrl("")).toEqual({});
    expect(parseProxyUrl(undefined)).toEqual({});
    expect(parseProxyUrl("not a url")).toEqual({});
    expect(parseProxyUrl("ftp://x.io:21")).toEqual({});
  });
  it("accepts a quoted value without credentials", () => {
    expect(parseProxyUrl('"socks5://10.0.0.2:1080"')).toEqual({ proxy: { server: "socks5://10.0.0.2:1080" } });
  });
});
