import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./config";
import { dictionaries } from "./messages";
import { translate, type MessageKey, type TranslateVars } from "./translate";

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getServerTranslator() {
  const locale = await getRequestLocale();
  const dict = dictionaries[locale];
  return {
    locale,
    t: (key: MessageKey, vars?: TranslateVars) => translate(dict, key, vars),
  };
}
