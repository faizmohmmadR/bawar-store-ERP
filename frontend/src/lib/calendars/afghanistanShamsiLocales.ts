/**
 * Afghanistan Solar Hijri (هجری شمسی افغانی) locales.
 * Uses official Afghan month names (Arabic zodiac), not Iranian Farvardin–Esfand.
 * Calendar math stays Solar Hijri (persian); only labels differ.
 */

export type DateObjectLocaleShape = {
  name: string;
  months: [string, string][];
  weekDays: [string, string][];
  digits: string[];
  meridiems: [string, string][];
};

/** Official Afghan Dari month names: حمل … حوت */
const AF_MONTHS_FA: [string, string][] = [
  ['حمل', 'حمل'],
  ['ثور', 'ثور'],
  ['جوزا', 'جوزا'],
  ['سرطان', 'سرط'],
  ['اسد', 'اسد'],
  ['سنبله', 'سنب'],
  ['میزان', 'میز'],
  ['عقرب', 'عقرب'],
  ['قوس', 'قوس'],
  ['جدی', 'جدی'],
  ['دلو', 'دلو'],
  ['حوت', 'حوت'],
];

/** Pashto solar month names used in Afghanistan */
const AF_MONTHS_PS: [string, string][] = [
  ['وری', 'وری'],
  ['غویی', 'غویی'],
  ['غبرګولی', 'غبر'],
  ['چنګاښ', 'چنګ'],
  ['زمری', 'زمر'],
  ['وږی', 'وږی'],
  ['تله', 'تله'],
  ['لړم', 'لړم'],
  ['لیندۍ', 'لین'],
  ['مرغومی', 'مرغ'],
  ['سلواغه', 'سلو'],
  ['کب', 'کب'],
];

/** English transliteration of Afghan Solar Hijri months */
const AF_MONTHS_EN: [string, string][] = [
  ['Hamal', 'Ham'],
  ['Sawr', 'Saw'],
  ['Jawza', 'Jaw'],
  ['Saratan', 'Sar'],
  ['Asad', 'Asa'],
  ['Sonbola', 'Son'],
  ['Mizan', 'Miz'],
  ['Aqrab', 'Aqr'],
  ['Qaws', 'Qaw'],
  ['Jadi', 'Jad'],
  ['Dalwa', 'Dal'],
  ['Hut', 'Hut'],
];

const WEEKDAYS_FA: [string, string][] = [
  ['شنبه', 'ش'],
  ['یکشنبه', 'ی'],
  ['دوشنبه', 'د'],
  ['سه‌شنبه', 'س'],
  ['چهارشنبه', 'چ'],
  ['پنجشنبه', 'پ'],
  ['جمعه', 'ج'],
];

const WEEKDAYS_PS: [string, string][] = [
  ['شنبه', 'ش'],
  ['یکشنبه', 'ی'],
  ['دوشنبه', 'د'],
  ['درېشنبه', 'د'],
  ['څلرشنبه', 'څ'],
  ['پنجشنبه', 'پ'],
  ['جمعه', 'ج'],
];

const WEEKDAYS_EN: [string, string][] = [
  ['Saturday', 'Sa'],
  ['Sunday', 'Su'],
  ['Monday', 'Mo'],
  ['Tuesday', 'Tu'],
  ['Wednesday', 'We'],
  ['Thursday', 'Th'],
  ['Friday', 'Fr'],
];

const DIGITS_LATIN = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const DIGITS_FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export const persian_af_fa: DateObjectLocaleShape = {
  name: 'persian_af_fa',
  months: AF_MONTHS_FA,
  weekDays: WEEKDAYS_FA,
  digits: DIGITS_FA,
  meridiems: [
    ['قبل از ظهر', 'ق.ظ'],
    ['بعد از ظهر', 'ب.ظ'],
  ],
};

export const persian_af_ps: DateObjectLocaleShape = {
  name: 'persian_af_ps',
  months: AF_MONTHS_PS,
  weekDays: WEEKDAYS_PS,
  digits: DIGITS_FA,
  meridiems: [
    ['سهار', 'س'],
    ['ماښام', 'م'],
  ],
};

export const persian_af_en: DateObjectLocaleShape = {
  name: 'persian_af_en',
  months: AF_MONTHS_EN,
  weekDays: WEEKDAYS_EN,
  digits: DIGITS_LATIN,
  meridiems: [
    ['AM', 'am'],
    ['PM', 'pm'],
  ],
};

/** Gregorian month names used in Afghan Dari. */
export const gregorian_af_fa: DateObjectLocaleShape = {
  ...persian_af_fa,
  name: 'gregorian_af_fa',
  months: [
    ['جنوری', 'جنوری'],
    ['فبروری', 'فبروری'],
    ['مارچ', 'مارچ'],
    ['اپریل', 'اپریل'],
    ['می', 'می'],
    ['جون', 'جون'],
    ['جولای', 'جولای'],
    ['اگست', 'اگست'],
    ['سپتمبر', 'سپتمبر'],
    ['اکتوبر', 'اکتوبر'],
    ['نومبر', 'نومبر'],
    ['دسمبر', 'دسمبر'],
  ],
};
