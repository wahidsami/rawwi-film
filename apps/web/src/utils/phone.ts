export function toAsciiDigits(value: string): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizePhoneDigits(value: string): string {
  return toAsciiDigits(value).replace(/[^\d]/g, "");
}

type PhoneRule = {
  minDigits: number;
  maxDigits: number;
  prefixPattern?: RegExp;
  example: string;
};

const PHONE_RULES: Record<string, PhoneRule> = {
  "+966": { minDigits: 9, maxDigits: 9, prefixPattern: /^5\d{8}$/, example: "5XXXXXXXX" },
  "+971": { minDigits: 9, maxDigits: 9, prefixPattern: /^5\d{8}$/, example: "5XXXXXXXX" },
  "+965": { minDigits: 8, maxDigits: 8, prefixPattern: /^(?:5|6|9)\d{7}$/, example: "5XXXXXXX" },
  "+973": { minDigits: 8, maxDigits: 8, prefixPattern: /^(?:3|6)\d{7}$/, example: "3XXXXXXX" },
  "+974": { minDigits: 8, maxDigits: 8, prefixPattern: /^(?:3|5|6|7)\d{7}$/, example: "3XXXXXXX" },
  "+968": { minDigits: 8, maxDigits: 8, prefixPattern: /^(?:2|3|7|9)\d{7}$/, example: "2XXXXXXX" },
  "+20": { minDigits: 10, maxDigits: 10, prefixPattern: /^1\d{9}$/, example: "1XXXXXXXXX" },
  "+962": { minDigits: 9, maxDigits: 9, prefixPattern: /^7\d{8}$/, example: "7XXXXXXXX" },
  "+212": { minDigits: 9, maxDigits: 9, prefixPattern: /^(?:6|7)\d{8}$/, example: "6XXXXXXXX" },
  "+216": { minDigits: 8, maxDigits: 8, prefixPattern: /^(?:2|4|5|9)\d{7}$/, example: "2XXXXXXX" },
  "+213": { minDigits: 9, maxDigits: 9, prefixPattern: /^(?:5|6|7)\d{8}$/, example: "5XXXXXXXX" },
  "+964": { minDigits: 10, maxDigits: 10, prefixPattern: /^7\d{9}$/, example: "7XXXXXXXXX" },
  "+963": { minDigits: 9, maxDigits: 9, prefixPattern: /^9\d{8}$/, example: "9XXXXXXXX" },
  "+961": { minDigits: 7, maxDigits: 8, prefixPattern: /^(?:3|7|8|9)\d{6,7}$/, example: "7XXXXXXX" },
  "+967": { minDigits: 8, maxDigits: 9, prefixPattern: /^7\d{7,8}$/, example: "7XXXXXXXX" },
  "+249": { minDigits: 9, maxDigits: 10, prefixPattern: /^9\d{8,9}$/, example: "9XXXXXXXX" },
  "+1": { minDigits: 10, maxDigits: 10, prefixPattern: /^[2-9]\d{9}$/, example: "2125551234" },
  "+44": { minDigits: 10, maxDigits: 10, prefixPattern: /^7\d{9}$/, example: "7123456789" },
  "+33": { minDigits: 9, maxDigits: 9, prefixPattern: /^(?:6|7)\d{8}$/, example: "612345678" },
  "+49": { minDigits: 10, maxDigits: 11, prefixPattern: /^1\d{9,10}$/, example: "15123456789" },
  "+91": { minDigits: 10, maxDigits: 10, prefixPattern: /^[6-9]\d{9}$/, example: "9123456789" },
  "+92": { minDigits: 10, maxDigits: 10, prefixPattern: /^3\d{9}$/, example: "3123456789" },
  "+90": { minDigits: 10, maxDigits: 10, prefixPattern: /^5\d{9}$/, example: "5123456789" },
};

function defaultPhoneRule(): PhoneRule {
  return {
    minDigits: 6,
    maxDigits: 15,
    example: "123456",
  };
}

export function getPhoneExample(countryCode: string): string {
  return (PHONE_RULES[countryCode.trim()] ?? defaultPhoneRule()).example;
}

export function validatePhoneForCountry(params: {
  countryCode: string;
  rawNumber: string;
  isArabic: boolean;
  label?: string;
}): { normalizedLocal: string; international: string; error: string | null } {
  const countryCode = String(params.countryCode ?? "").trim();
  const rawNumber = String(params.rawNumber ?? "");
  const isArabic = params.isArabic;
  const label = params.label ?? (isArabic ? "رقم الهاتف" : "Phone number");

  if (!countryCode) {
    return {
      normalizedLocal: "",
      international: "",
      error: isArabic ? `يرجى اختيار مفتاح الدولة لِـ ${label}` : `Please choose a country code for ${label}`,
    };
  }

  const digits = normalizePhoneDigits(rawNumber);
  if (!digits) {
    return {
      normalizedLocal: "",
      international: "",
      error: isArabic ? `يرجى إدخال ${label}` : `Please enter ${label}`,
    };
  }

  const rule = PHONE_RULES[countryCode] ?? defaultPhoneRule();
  const candidates = digits.startsWith("0") && digits.length > 1 ? [digits, digits.slice(1)] : [digits];
  const matched = candidates.find((candidate) => {
    if (candidate.length < rule.minDigits || candidate.length > rule.maxDigits) return false;
    if (rule.prefixPattern && !rule.prefixPattern.test(candidate)) return false;
    return true;
  });

  if (!matched) {
    const example = rule.example;
    return {
      normalizedLocal: "",
      international: "",
      error: isArabic
        ? `رقم ${label} غير صحيح. مثال مقبول: ${example}`
        : `Invalid ${label}. Example: ${example}`,
    };
  }

  return {
    normalizedLocal: matched,
    international: `${countryCode}${matched}`,
    error: null,
  };
}
