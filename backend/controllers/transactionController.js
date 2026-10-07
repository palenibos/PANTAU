const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const cache = require('../services/cache');
const { listCategories } = require('../services/categoryService');
const { categoryMonthSpend, checkBudgetAlert } = require('../services/alerts');
const { toDto } = require('../services/dashboardService');
const { monthRange, dayRange, monthKey, DAY_MS } = require('../utils/time');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const catMap = (categories) => new Map(categories.map((c) => [c.name.toLowerCase(), c]));

async function findCategory(userId, name, txType) {
  const cat = await Category.findOne({ userId, nameKey: name.trim().toLowerCase() });
  if (!cat) {
    throw new ApiError(400, `Kategori "${name}" nggak ditemukan. Tambah dulu di Pengaturan ya.`, 'CATEGORY_NOT_FOUND');
  }
  const expected = txType === 'income' ? 'income' : 'expense';
  if (cat.type !== expected) {
    throw new ApiError(
      400,
      `Kategori "${cat.name}" bukan kategori ${txType === 'income' ? 'pemasukan' : 'pengeluaran'}.`,
      'CATEGORY_TYPE_MISMATCH',
    );
  }
  return cat;
}

function assertNotFarFuture(date) {
  if (date.getTime() > Date.now() + DAY_MS) {
    throw new ApiError(400, 'Tanggal terlalu jauh di masa depan', 'VALIDATION_ERROR');
  }
}

async function list(req, res) {
  const q = req.valid.query;
  const filter = { userId: req.user._id };

  if (q.month) {
    const { start, end } = monthRange(q.month);
    filter.date = { $gte: start, $lt: end };
  } else if (q.from || q.to) {
    filter.date = {};
    if (q.from) filter.date.$gte = dayRange(q.from).start;
    if (q.to) filter.date.$lt = dayRange(q.to).end;
  }
  if (q.category) filter.category = q.category;
  if (q.type) filter.type = q.type;
  if (q.minAmount != null || q.maxAmount != null) {
    filter.amount = {};
    if (q.minAmount != null) filter.amount.$gte = q.minAmount;
    if (q.maxAmount != null) filter.amount.$lte = q.maxAmount;
  }
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ notes: re }, { category: re }];
  }

  const [rows, total, sums, categories] = await Promise.all([
    Transaction.find(filter)
      .sort({ date: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate([{ $match: filter }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    listCategories(req.user._id),
  ]);

  const byName = catMap(categories);
  const sum = (t) => sums.find((s) => s._id === t)?.total || 0;

  res.json({
    success: true,
    data: rows.map((t) => toDto(t, byName)),
    total,
    page: q.page,
    limit: q.limit,
    hasMore: q.page * q.limit < total,
    summary: { income: sum('income'), expense: sum('expense') },
  });
}

async function getOne(req, res) {
  const tx = await Transaction.findOne({ _id: req.valid.params.id, userId: req.user._id }).lean();
  if (!tx) throw new ApiError(404, 'Transaksi nggak ditemukan', 'NOT_FOUND');
  res.json({ success: true, data: toDto(tx, catMap(await listCategories(req.user._id))) });
}

async function create(req, res) {
  const body = req.valid.body;
  const user = req.user;
  const cat = await findCategory(user._id, body.category, body.type);
  const date = body.date || new Date();
  assertNotFarFuture(date);

  const tx = await Transaction.create({
    userId: user._id,
    type: body.type,
    category: cat.name,
    amount: body.amount,
    notes: body.notes,
    date,
  });
  cache.invalidateUser(user._id);

  let alerts = [];
  if (tx.type === 'expense') {
    const after = await categoryMonthSpend(user._id, cat.name, monthKey(date));
    const alert = await checkBudgetAlert({ user, category: cat, txDate: date, before: after - tx.amount, after });
    if (alert) alerts = [alert];
  }

  res.status(201).json({
    success: true,
    message: 'Transaksi berhasil dicatat ✅',
    data: toDto(tx.toObject(), new Map([[cat.name.toLowerCase(), cat]])),
    alerts,
  });
}

async function update(req, res) {
  const body = req.valid.body;
  const user = req.user;
  const tx = await Transaction.findOne({ _id: req.valid.params.id, userId: user._id });
  if (!tx) throw new ApiError(404, 'Transaksi nggak ditemukan', 'NOT_FOUND');

  const old = { type: tx.type, category: tx.category, amount: tx.amount, month: monthKey(tx.date) };

  const nextType = body.type ?? tx.type;
  const cat = await findCategory(user._id, body.category ?? tx.category, nextType);
  if (body.date) assertNotFarFuture(body.date);

  tx.type = nextType;
  tx.category = cat.name;
  if (body.amount != null) tx.amount = body.amount;
  if (body.notes != null) tx.notes = body.notes;
  if (body.date) tx.date = body.date;
  await tx.save();
  cache.invalidateUser(user._id);

  // Alert hanya bila pengeluaran di bucket (kategori, bulan) ini bertambah.
  let alerts = [];
  if (tx.type === 'expense') {
    const month = monthKey(tx.date);
    const without = await categoryMonthSpend(user._id, cat.name, month, tx._id);
    const wasInBucket = old.type === 'expense' && old.category === cat.name && old.month === month;
    const before = without + (wasInBucket ? old.amount : 0);
    const alert = await checkBudgetAlert({ user, category: cat, txDate: tx.date, before, after: without + tx.amount });
    if (alert) alerts = [alert];
  }

  res.json({
    success: true,
    message: 'Transaksi berhasil diubah ✏️',
    data: toDto(tx.toObject(), new Map([[cat.name.toLowerCase(), cat]])),
    alerts,
  });
}

async function remove(req, res) {
  const result = await Transaction.deleteOne({ _id: req.valid.params.id, userId: req.user._id });
  if (!result.deletedCount) throw new ApiError(404, 'Transaksi nggak ditemukan', 'NOT_FOUND');
  cache.invalidateUser(req.user._id);
  res.json({ success: true, message: 'Transaksi dihapus 🗑️' });
}

module.exports = { list, getOne, create, update, remove };
