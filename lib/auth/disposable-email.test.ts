import { expect, it } from "vitest";

import { isDisposableEmail } from "./disposable-email";

it("blocks throwaway inboxes and their subdomains", () => {
  for (const e of ["a@mailinator.com", "x@sub.mailinator.com", "b@10minutemail.com", "c@temp-mail.org", "d@yopmail.com", "e@guerrillamail.info", "f@mytempmailbox.xyz", "g@my-throwaway.net", "h@1secmail.com"]) {
    expect(isDisposableEmail(e), e).toBe(true);
  }
});

it("allows real providers and company domains", () => {
  for (const e of ["founder@gmail.com", "a@outlook.com", "b@yahoo.co.in", "c@zohomail.in", "d@rediffmail.com", "e@mamaearth.in", "f@templeofhair.com", "g@tempo.in", "h@zooptrack.co.in", "", null, "no-at-sign"]) {
    expect(isDisposableEmail(e as string), String(e)).toBe(false);
  }
});
