const FALLBACK_DIAL_CODES: Record<string, string> = {
  AR: "54", AU: "61", BR: "55", CA: "1", DE: "49", ES: "34", FR: "33",
  GB: "44", ID: "62", IN: "91", IT: "39", JP: "81", KR: "82", MX: "52",
  MY: "60", NL: "31", PH: "63", PL: "48", RU: "7", SG: "65", TH: "66",
  TR: "90", UA: "380", US: "1", VN: "84",
};

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function smsPoolPurchasePhoneNumber(input: {
  number?: string | number;
  cc?: string;
  phonenumber: string;
}) {
  const countryCallingCode = digits(input.cc);
  const completeNumber = digits(input.number);
  const phoneNumber = digits(input.phonenumber);
  if (completeNumber) return `+${completeNumber}`;
  if (!countryCallingCode || !phoneNumber) return input.phonenumber.trim();
  return `+${phoneNumber.startsWith(countryCallingCode)
    ? phoneNumber
    : `${countryCallingCode}${phoneNumber.replace(/^0+/, "")}`}`;
}

export function formatSmsPoolPhoneNumber(phoneNumber: string | null, countryCode?: string | null) {
  if (!phoneNumber) return null;
  const trimmed = phoneNumber.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const normalized = digits(trimmed);
  const dialCode = FALLBACK_DIAL_CODES[(countryCode ?? "").toUpperCase()];
  if (!normalized || !dialCode) return trimmed;
  const isAlreadyInternational =
    normalized.startsWith(dialCode) && normalized.length >= dialCode.length + 9;
  return `+${isAlreadyInternational
    ? normalized
    : `${dialCode}${normalized.replace(/^0+/, "")}`}`;
}
