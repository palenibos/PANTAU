const Joi = require('joi');
const { isMonthKey, isDayKey } = require('./time');

// Pesan error Joi dalam Bahasa Indonesia. {{#label}} diisi dari .label('...') per field.
const messages = {
  'any.required': '{{#label}} wajib diisi',
  'any.only': '{{#label}} nggak valid',
  'any.invalid': '{{#label}} nggak valid',
  'object.unknown': 'Field {{#label}} nggak dikenali',
  'object.min': 'Minimal isi salah satu field ya',
  'string.base': '{{#label}} harus berupa teks',
  'string.empty': '{{#label}} nggak boleh kosong',
  'string.min': '{{#label}} minimal {{#limit}} karakter',
  'string.max': '{{#label}} maksimal {{#limit}} karakter',
  'string.email': 'Format email nggak valid',
  'string.pattern.base': '{{#label}} formatnya nggak valid',
  'number.base': '{{#label}} harus berupa angka',
  'number.integer': '{{#label}} harus bilangan bulat (tanpa koma)',
  'number.min': '{{#label}} minimal {{#limit}}',
  'number.max': '{{#label}} maksimal {{#limit}}',
  'number.positive': '{{#label}} harus lebih dari 0',
  'date.base': '{{#label}} bukan tanggal yang valid',
  'date.format': '{{#label}} bukan tanggal yang valid',
  'date.min': '{{#label}} terlalu lampau',
  'date.max': '{{#label}} terlalu jauh di masa depan',
  'boolean.base': '{{#label}} harus true atau false',
};

const MAX_AMOUNT = 100_000_000_000; // Rp 100 miliar — batas waras buat input manual

// Hapus karakter kontrol & rapikan spasi. Output tetap dianggap data (bukan HTML);
// frontend wajib meng-escape saat render.
const clean = (value, helpers) => {
  const s = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return s;
};

const text = (label, max) =>
  Joi.string().label(label).trim().max(max).custom(clean);

const objectId = Joi.string().hex().length(24).label('ID');
const monthStr = Joi.string()
  .label('Bulan')
  .custom((v, h) => (isMonthKey(v) ? v : h.error('string.pattern.base')));
const dayStr = Joi.string()
  .label('Tanggal')
  .custom((v, h) => (isDayKey(v) ? v : h.error('string.pattern.base')));

const amount = Joi.number().label('Nominal').integer().min(1).max(MAX_AMOUNT);
const budget = Joi.number().label('Budget').integer().min(0).max(MAX_AMOUNT);

// Emoji: tepat satu grapheme dan mengandung pictograph — mencegah teks bebas/HTML nyasar ke kolom emoji.
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('id', { granularity: 'grapheme' }) : null;
const emoji = Joi.string()
  .label('Emoji')
  .trim()
  .max(24)
  .custom((v, h) => {
    const graphemes = segmenter ? [...segmenter.segment(v)].length : 1;
    if (graphemes !== 1 || !/\p{Extended_Pictographic}/u.test(v)) return h.error('any.invalid');
    return v;
  });

const schemas = {
  register: Joi.object({
    email: Joi.string().label('Email').trim().lowercase().email().max(254).required(),
    password: Joi.string().label('Password').min(8).max(72).required(),
    name: text('Nama', 60).min(1).required(),
  }),
  login: Joi.object({
    email: Joi.string().label('Email').trim().lowercase().email().required(),
    password: Joi.string().label('Password').max(72).required(),
  }),
  refresh: Joi.object({ refreshToken: Joi.string().label('Refresh token').max(200).required() }),
  logout: Joi.object({ refreshToken: Joi.string().label('Refresh token').max(200).allow('') }),

  transactionCreate: Joi.object({
    type: Joi.string().label('Tipe').valid('income', 'expense').required(),
    category: text('Kategori', 40).min(1).required(),
    amount: amount.required(),
    notes: text('Catatan', 200).allow('').default(''),
    date: Joi.date().label('Tanggal').iso().min('2000-01-01'),
  }),
  // PUT: semua field opsional (partial) — field yang tidak dikirim tidak diubah.
  transactionUpdate: Joi.object({
    type: Joi.string().label('Tipe').valid('income', 'expense'),
    category: text('Kategori', 40).min(1),
    amount,
    notes: text('Catatan', 200).allow(''),
    date: Joi.date().label('Tanggal').iso().min('2000-01-01'),
  }).min(1),
  transactionQuery: Joi.object({
    month: monthStr,
    from: dayStr.label('Dari tanggal'),
    to: dayStr.label('Sampai tanggal'),
    category: text('Kategori', 40),
    type: Joi.string().label('Tipe').valid('income', 'expense'),
    q: text('Pencarian', 60),
    minAmount: Joi.number().label('Nominal minimum').integer().min(0),
    maxAmount: Joi.number().label('Nominal maksimum').integer().min(0),
    page: Joi.number().label('Halaman').integer().min(1).default(1),
    limit: Joi.number().label('Limit').integer().min(1).max(100).default(50),
  }),

  categoryCreate: Joi.object({
    name: text('Nama kategori', 30).min(1).required(),
    emoji: emoji.required(),
    type: Joi.string().label('Tipe').valid('expense', 'income').default('expense'),
    budgetLimit: budget.default(0),
    isSaving: Joi.boolean().label('Tabungan').default(false),
  }),
  categoryUpdate: Joi.object({
    name: text('Nama kategori', 30).min(1),
    emoji,
    budgetLimit: budget,
    isSaving: Joi.boolean().label('Tabungan'),
  }).min(1),

  settingsUpdate: Joi.object({
    name: text('Nama', 60).min(1),
    currency: Joi.string().label('Mata uang').valid('IDR'),
    monthlyBudget: budget.label('Budget bulanan'),
    notificationEnabled: Joi.boolean().label('Notifikasi'),
    weeklyDigest: Joi.boolean().label('Ringkasan mingguan'),
    darkMode: Joi.boolean().label('Mode gelap'),
  }).min(1),
  budgetUpdate: Joi.object({ budgetLimit: budget.required() }),
  resetData: Joi.object({ confirm: Joi.string().label('Konfirmasi').valid('RESET').required() }),
  exportQuery: Joi.object({ format: Joi.string().label('Format').valid('json', 'csv').default('json') }),

  monthParam: Joi.object({ month: monthStr.required() }),
  weeklyQuery: Joi.object({ end: dayStr }),
  idParam: Joi.object({ id: objectId.required() }),
  categoryIdParam: Joi.object({ categoryId: objectId.required() }),
  notificationQuery: Joi.object({
    limit: Joi.number().label('Limit').integer().min(1).max(100).default(30),
  }),
};

module.exports = { Joi, schemas, messages, MAX_AMOUNT };
