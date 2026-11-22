/**
 * Idiomas que Meta acepta para plantillas de WhatsApp Cloud API.
 *
 * Copiado de la lista oficial («Supported Languages», actualizada por Meta el
 * 21-may-2026). El código es lo que viaja a Meta; el nombre es para el
 * selector. Un código fuera de esta lista Meta lo rechaza, así que el servidor
 * valida contra ella antes de gastar la llamada.
 *
 * Puro y sin dependencias: lo usan la API, la pantalla de Plantillas y el
 * selector de la Bandeja.
 */

export type TemplateLanguageGroup = "es" | "pt-en" | "otros";

type Entry = { code: string; name: string; group: TemplateLanguageGroup };

const ESPANOL: Entry[] = [
  { code: "es_MX", name: "Spanish (Mexico)", group: "es" },
  { code: "es", name: "Spanish (general)", group: "es" },
  { code: "es_AR", name: "Spanish (Argentina)", group: "es" },
  { code: "es_CL", name: "Spanish (Chile)", group: "es" },
  { code: "es_CO", name: "Spanish (Colombia)", group: "es" },
  { code: "es_CR", name: "Spanish (Costa Rica)", group: "es" },
  { code: "es_EC", name: "Spanish (Ecuador)", group: "es" },
  { code: "es_ES", name: "Spanish (Spain)", group: "es" },
  { code: "es_HN", name: "Spanish (Honduras)", group: "es" },
  { code: "es_PA", name: "Spanish (Panama)", group: "es" },
  { code: "es_PE", name: "Spanish (Peru)", group: "es" },
  { code: "es_DO", name: "Spanish (Dominican Republic)", group: "es" },
  { code: "es_UY", name: "Spanish (Uruguay)", group: "es" },
];

const PORTUGUES_E_INGLES: Entry[] = [
  { code: "pt_BR", name: "Portuguese (Brazil)", group: "pt-en" },
  { code: "pt_PT", name: "Portuguese (Portugal)", group: "pt-en" },
  { code: "en_US", name: "English (US)", group: "pt-en" },
  { code: "en", name: "English (general)", group: "pt-en" },
  { code: "en_GB", name: "English (UK)", group: "pt-en" },
  { code: "en_CA", name: "English (Canada)", group: "pt-en" },
  { code: "en_AU", name: "English (Australia)", group: "pt-en" },
  { code: "en_IE", name: "English (Ireland)", group: "pt-en" },
  { code: "en_IN", name: "English (India)", group: "pt-en" },
  { code: "en_JM", name: "English (Jamaica)", group: "pt-en" },
  { code: "en_NZ", name: "English (New Zealand)", group: "pt-en" },
  { code: "en_SG", name: "English (Singapore)", group: "pt-en" },
  { code: "en_ZA", name: "English (South Africa)", group: "pt-en" },
  { code: "en_AE", name: "English (UAE)", group: "pt-en" },
  { code: "en_GH", name: "English (Ghana)", group: "pt-en" },
  { code: "en_MY", name: "English (Malaysia)", group: "pt-en" },
  { code: "en_QA", name: "English (Qatar)", group: "pt-en" },
  { code: "en_UG", name: "English (Uganda)", group: "pt-en" },
];

const OTROS: Entry[] = (
  [
    ["af", "Afrikaans"], ["sq", "Albanian"], ["de", "German"],
    ["de_AT", "German (Austria)"], ["de_CH", "German (Switzerland)"], ["ar", "Arabic"],
    ["ar_EG", "Arabic (Egypt)"], ["ar_AE", "Arabic (UAE)"],
    ["ar_LB", "Arabic (Lebanon)"], ["ar_MA", "Arabic (Morocco)"],
    ["ar_QA", "Arabic (Qatar)"], ["az", "Azerbaijani"], ["be_BY", "Belarusian"],
    ["bn", "Bengali"], ["bn_IN", "Bengali (India)"], ["bg", "Bulgarian"],
    ["kn", "Kannada"], ["ca", "Catalan"], ["cs", "Czech"],
    ["zh_CN", "Chinese (China)"], ["zh_HK", "Chinese (Hong Kong)"],
    ["zh_TW", "Chinese (Taiwan)"], ["si_LK", "Sinhala"], ["ko", "Korean"],
    ["hr", "Croatian"], ["da", "Danish"], ["prs_AF", "Dari"], ["sk", "Slovak"],
    ["sl", "Slovenian"], ["et", "Estonian"], ["fil", "Filipino"],
    ["fi", "Finnish"], ["fr", "French"], ["fr_BE", "French (Belgium)"],
    ["fr_CA", "French (Canada)"], ["fr_CI", "French (Côte d'Ivoire)"],
    ["fr_MA", "French (Morocco)"], ["fr_CH", "French (Switzerland)"],
    ["ka", "Georgian"], ["el", "Greek"], ["gu", "Gujarati"], ["ha", "Hausa"],
    ["he", "Hebrew"], ["hi", "Hindi"], ["hu", "Hungarian"], ["id", "Indonesian"],
    ["ga", "Irish"], ["it", "Italian"], ["ja", "Japanese"], ["kk", "Kazakh"],
    ["rw_RW", "Kinyarwanda"], ["ky_KG", "Kyrgyz"], ["lo", "Lao"],
    ["lv", "Latvian"], ["lt", "Lithuanian"], ["mk", "Macedonian"],
    ["ml", "Malayalam"], ["ms", "Malay"], ["mr", "Marathi"],
    ["nl", "Dutch"], ["nl_BE", "Dutch (Belgium)"], ["nb", "Norwegian"],
    ["pa", "Punjabi"], ["ps_AF", "Pashto"], ["fa", "Persian"], ["pl", "Polish"],
    ["ro", "Romanian"], ["ru", "Russian"], ["sr", "Serbian"], ["sw", "Swahili"],
    ["sv", "Swedish"], ["th", "Thai"], ["ta", "Tamil"], ["te", "Telugu"],
    ["tr", "Turkish"], ["uk", "Ukrainian"], ["ur", "Urdu"], ["uz", "Uzbek"],
    ["vi", "Vietnamese"], ["zu", "Zulu"],
  ] as const
).map(([code, name]) => ({ code, name, group: "otros" as const }));

export const TEMPLATE_LANGUAGES: readonly Entry[] = [
  ...ESPANOL,
  ...PORTUGUES_E_INGLES,
  ...OTROS,
];

export const TEMPLATE_LANGUAGE_GROUPS: { id: TemplateLanguageGroup; label: string }[] = [
  { id: "es", label: "Spanish" },
  { id: "pt-en", label: "Portuguese and English" },
  { id: "otros", label: "Other languages" },
];

export const DEFAULT_TEMPLATE_LANGUAGE = "es_MX";

const BY_CODE = new Map(TEMPLATE_LANGUAGES.map((l) => [l.code, l.name]));

export function isTemplateLanguage(code: string): boolean {
  return BY_CODE.has(code);
}

/** Nombre legible; un código desconocido (p. ej. sincronizado de Meta) se muestra tal cual. */
export function templateLanguageName(code: string): string {
  return BY_CODE.get(code) ?? code;
}
