/**
 * Every page has its own type voice. Fonts are declared once here with
 * preload off, so a browser only downloads the pair the current page uses.
 * The route -> font mapping lives in globals.css (html[data-route="..."]).
 * next/font needs literal options and one const per call.
 */
import {
  Archivo,
  Bitter,
  Bricolage_Grotesque,
  DM_Sans,
  DM_Serif_Display,
  Epilogue,
  Figtree,
  Fraunces,
  Hanken_Grotesk,
  IBM_Plex_Sans,
  Instrument_Sans,
  Instrument_Serif,
  Karla,
  Libre_Franklin,
  Lora,
  Manrope,
  Mulish,
  Newsreader,
  Nunito_Sans,
  Outfit,
  Public_Sans,
  Rubik,
  Schibsted_Grotesk,
  Sora,
  Source_Sans_3,
  Source_Serif_4,
  Space_Mono,
  Spectral,
  Syne,
  Work_Sans,
  Young_Serif,
} from "next/font/google";

const f_fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], display: "swap", preload: false, variable: "--f-fraunces" });
const f_manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-manrope" });
const f_outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-outfit" });
const f_epilogue = Epilogue({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-epilogue" });
const f_bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-bricolage" });
const f_figtree = Figtree({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-figtree" });
const f_sora = Sora({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-sora" });
const f_plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false, variable: "--f-plex" });
const f_syne = Syne({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-syne" });
const f_rubik = Rubik({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-rubik" });
const f_dmserif = DM_Serif_Display({ subsets: ["latin"], weight: ["400"], display: "swap", preload: false, variable: "--f-dmserif" });
const f_dmsans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-dmsans" });
const f_spacemono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false, variable: "--f-spacemono" });
const f_karla = Karla({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-karla" });
const f_instserif = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap", preload: false, variable: "--f-instserif" });
const f_instsans = Instrument_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-instsans" });
const f_newsreader = Newsreader({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-newsreader" });
const f_sourcesans = Source_Sans_3({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-sourcesans" });
const f_lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-lora" });
const f_nunito = Nunito_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-nunito" });
const f_sourceserif = Source_Serif_4({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-sourceserif" });
const f_publicsans = Public_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-publicsans" });
const f_spectral = Spectral({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap", preload: false, variable: "--f-spectral" });
const f_mulish = Mulish({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-mulish" });
const f_youngserif = Young_Serif({ subsets: ["latin"], weight: ["400"], display: "swap", preload: false, variable: "--f-youngserif" });
const f_franklin = Libre_Franklin({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-franklin" });
const f_archivo = Archivo({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-archivo" });
const f_worksans = Work_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-worksans" });
const f_schibsted = Schibsted_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-schibsted" });
const f_bitter = Bitter({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-bitter" });
const f_hanken = Hanken_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-hanken" });

export const pageFontVars = [f_bitter, f_hanken, f_fraunces, f_manrope, f_outfit, f_epilogue, f_bricolage, f_figtree, f_sora, f_plex, f_syne, f_rubik, f_dmserif, f_dmsans, f_spacemono, f_karla, f_instserif, f_instsans, f_newsreader, f_sourcesans, f_lora, f_nunito, f_sourceserif, f_publicsans, f_spectral, f_mulish, f_youngserif, f_franklin, f_archivo, f_worksans, f_schibsted]
  .map((f) => f.variable)
  .join(" ");
