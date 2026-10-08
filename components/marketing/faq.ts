import { FOUNDING_OFFER, PAID_PLANS, PLANS, TRIAL_DAYS, formatInr } from "@/lib/billing/plans";

const PRICE_LINE = PAID_PLANS.map((k) => `${PLANS[k].name} ${formatInr(PLANS[k].priceInr)}`).join(", ");

/** One FAQ list for the /faq page and the marketing site. Keep every answer true. */
export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What does Zooptrack do?",
    a: "It watches your competitors' Facebook and Instagram ads in India, tells you what changed every day (big pushes, new offers, ads they keep running) and suggests your next move, with the ads as evidence.",
  },
  {
    q: "Where does the ad data come from?",
    a: "From Meta's public Ad Library. We read every ad your rivals run, live and stopped, and show how our count compares with Meta's own total so you know how complete it is.",
  },
  {
    q: "Do you show ad spend or results?",
    a: "No. Meta does not publish spend, reach or results for Indian commercial ads, so no tool can know them. We show what is real: how many ads, how long each has run, offers, hooks and formats. We never estimate spend.",
  },
  {
    q: "How fresh is it?",
    a: "Watched rivals are read every night. When you add a new rival, the first read starts right away and usually finishes within the hour.",
  },
  {
    q: "Do I need to connect my ad account?",
    a: "No. Zooptrack only needs your email and the brands you want to watch. Add your own brand's Meta page to compare your public ads with each rival.",
  },
  {
    q: "What does it cost? Can I cancel?",
    a: `Start with a ${TRIAL_DAYS}-day free trial, no card. Then ${PRICE_LINE} a month, paid by UPI AutoPay or card. Pay yearly and get 2 months free. Our first ${FOUNDING_OFFER.spots} customers keep their price for ${FOUNDING_OFFER.lockMonths} months. Cancel any time; you keep access to the end of the month you paid for.`,
  },
  {
    q: "Is it legal to track competitors' ads?",
    a: "Yes. Zooptrack only reads Meta's public Ad Library, which Meta publishes so anyone can see the ads a brand runs. We never log in to anyone's account or access private data.",
  },
  {
    q: "How is this better than checking the Ad Library myself?",
    a: "The Ad Library shows one brand at a time, with no history, no labels and no alerts. Zooptrack checks every rival daily, keeps the history after ads stop, labels hooks and offers, and tells you what changed.",
  },
  {
    q: "Which platforms do you cover?",
    a: "Facebook and Instagram (Meta) ads today. Google and YouTube ads are next on our roadmap.",
  },
  {
    q: "When does the report arrive?",
    a: "When you choose: daily or weekly, at any time of day in IST. You can also send it to yourself instantly with Send now, and get an email the moment a rival makes a big move.",
  },
  {
    q: "Can my team use one account?",
    a: "Not yet. Team seats and client workspaces for agencies are next on our list. Write to hello.zooptrack@gmail.com if you need them now.",
  },
];
