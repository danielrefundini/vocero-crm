/**
 * Traduce el error de envío de Meta a algo que el operador pueda ACCIONAR.
 *
 * Meta manda el motivo en inglés y en jerga propia ("User's number is part of
 * an experiment"), y el CRM lo guardaba sin mostrarlo: el mensaje fallido solo
 * enseñaba un triángulo mudo. Aquí se convierte en una frase que dice qué
 * pasó y qué hacer, conservando el código para poder rastrearlo en la
 * documentación de Meta.
 */

const DESCRIPTIONS: Record<number, string> = {
  130472:
    "Meta has the recipient's number in an experiment and is blocking MARKETING messages to it. It's not a problem with your setup: try a UTILITY template or another number.",
  131049:
    "Meta limited marketing messages to this user to protect ecosystem quality. Wait or use a UTILITY template.",
  131047:
    "More than 24 h have passed since the customer's last message: it can only be reopened with an approved template.",
  131048:
    "Meta throttled the send due to the spam limit on your number. Slow down your sending rate and check the number's quality.",
  131026:
    "The recipient can't receive WhatsApp messages (nonexistent number, no account, or doesn't accept business messages).",
  131031:
    "Your WhatsApp Business account is blocked or restricted by Meta. Check it in WhatsApp Manager.",
  131030:
    "The recipient's number isn't on your app's allowed list in test mode.",
  130429:
    "You exceeded Meta's messages-per-second limit. Retry in a few moments.",
  132000:
    "The template and the parameters sent don't match (variables missing or extra).",
  132001:
    "Meta can't find that template in that language. Sync templates and confirm it's still approved.",
  132005:
    "The template's translated text exceeds Meta's character limit.",
  132007:
    "The template content violates Meta's policies.",
  132012:
    "The template parameters don't follow the format Meta expects.",
  132015:
    "The template is paused for low quality: Meta won't let it send until it recovers.",
  132016:
    "The template was disabled for quality and can no longer be sent.",
  133010: "The number isn't registered on the Cloud API.",
  368: "The number is temporarily blocked for violating Meta's policies.",
};

/**
 * @param code   Código numérico de Meta (`errors[0].code`), si vino.
 * @param detail Texto crudo de Meta, como respaldo cuando el código es nuevo.
 */
export function describeSendError(
  code: number | null | undefined,
  detail?: string | null
): string {
  const known = code != null ? DESCRIPTIONS[code] : undefined;
  // `||` y no `??`: Meta a veces manda el texto vacío o en blanco, y un
  // mensaje de error vacío es tan inútil como el triángulo mudo.
  const base = known || detail?.trim() || "Meta rejected the send";
  return code != null ? `${base} (Meta ${code})` : base;
}
