/**
 * Throwaway / temporary inbox detection for sign-up.
 *
 * Two layers: a list of well-known disposable domains (and any subdomain of
 * them), plus name patterns that throwaway services use. Real providers
 * (gmail, outlook, yahoo, zoho, rediffmail, company domains) never match.
 * Add a domain to DISPOSABLE_DOMAINS when one slips through.
 */

export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "mailinator.net", "mailinator2.com", "notmailinator.com", "binkmail.com", "bobmail.info", "chammy.info",
  "suremail.info", "thisisnotmyrealemail.com", "veryrealemail.com", "zippymail.info", "reallymymail.com",
  "10minutemail.com", "10minutemail.net", "10minutemail.co.uk", "10minutemail.de", "10minemail.com", "20minutemail.com",
  "temp-mail.org", "temp-mail.io", "temp-mail.com", "tempmail.com", "tempmail.net", "tempmail.dev", "tempmail.plus",
  "tempmailo.com", "tempmail.email", "tempmailaddress.com", "tempinbox.com", "tempr.email", "tempail.com", "temporary-mail.net",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
  "guerrillamailblock.com", "grr.la", "sharklasers.com", "pokemail.net", "spam4.me",
  "yopmail.com", "yopmail.net", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj",
  "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
  "trashmail.com", "trashmail.net", "trashmail.de", "trashmail.io", "trashmail.me", "trash-mail.com", "trashmail.ws", "wegwerfmail.de",
  "wegwerfmail.net", "wegwerfmail.org", "einrot.com", "fakeinbox.com", "fakemail.net", "fakemailgenerator.com",
  "throwawaymail.com", "throwam.com", "dispostable.com", "discard.email", "discardmail.com", "discardmail.de", "spambog.com",
  "getnada.com", "nada.email", "inboxbear.com", "maildrop.cc", "mailnesia.com", "mailcatch.com", "mintemail.com", "mytemp.email",
  "mohmal.com", "moakt.com", "moakt.cc", "emailondeck.com", "emailfake.com", "email-fake.com", "fake-email.net", "generator.email",
  "dropmail.me", "10mail.org", "emltmp.com", "minimail.gq", "spamgourmet.com", "spamex.com", "mailexpire.com", "mailforspam.com",
  "mailmetrash.com", "mailnull.com", "meltmail.com", "mt2015.com", "mytrashmail.com", "nowmymail.com", "objectmail.com",
  "onewaymail.com", "owlymail.com", "proxymail.eu", "rcpt.at", "rmqkr.net", "rppkn.com", "s0ny.net", "safetymail.info",
  "selfdestructingmail.com", "sendspamhere.com", "shieldemail.com", "smellfear.com", "sogetthis.com", "spamavert.com",
  "spambox.us", "spamfree24.org", "spamherelots.com", "spamhole.com", "spaml.de", "spammotel.com", "spamspot.com", "spamthis.co.uk",
  "tempomail.fr", "temporaryemail.net", "temporaryinbox.com", "thankyou2010.com", "trbvm.com", "tyldd.com", "uggsrock.com",
  "wh4f.org", "whyspam.me", "willselfdestruct.com", "xagloo.com", "yepmail.net", "zoemail.org", "burnermail.io", "33mail.com",
  "anonaddy.me", "mailpoof.com", "crazymailing.com", "harakirimail.com", "incognitomail.org", "mail.tm", "mailbox.in.ua",
  "luxusmail.org", "linshiyouxiang.net", "byom.de", "dayrep.com", "armyspy.com", "cuvox.de", "fleckens.hu", "gustr.com",
  "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "mvrht.net", "vomoto.com", "tmpmail.org", "tmpmail.net",
  "tmpeml.com", "tmail.ws", "boximail.com", "fexpost.com", "fextemp.com", "inboxkitten.com", "1secmail.com", "1secmail.net",
  "1secmail.org", "esiix.com", "wwjmp.com", "xojxe.com", "yoggm.com", "kzccv.com", "qiott.com", "vjuum.com", "laafd.com",
  "txcct.com", "dpptd.com", "rteet.com", "mailsac.com", "anonbox.net", "deadaddress.com", "mailhazard.com", "spam.la",
]);

/** Name fragments used by throwaway inbox services. */
const DISPOSABLE_PATTERNS = [
  /(temp|tmp)-?(e?mail|inbox)/,
  /10-?min(ute)?-?(e?mail)?/,
  /throw-?away/,
  /trash-?mail/,
  /fake-?(e?mail|inbox)/,
  /guerrilla/,
  /mailinator/,
  /yopmail/,
  /disposable/,
  /burner-?mail/,
  /spam-?(box|gourmet|hole|mail)/,
];

export function emailDomain(email: string | null | undefined): string {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@");
  return at > 0 ? (email ?? "").trim().toLowerCase().slice(at + 1) : "";
}

export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return DISPOSABLE_PATTERNS.some((re) => re.test(domain));
}

export const DISPOSABLE_EMAIL_MESSAGE = "Temporary email addresses can't be used. Please sign up with your work or personal email (Gmail is fine).";
