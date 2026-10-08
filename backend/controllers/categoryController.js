const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const cache = require('../services/cache');
const { listCategories } = require('../services/categoryService');

const CUSTOM_SORT_BASE = 1000;

async function list(req, res) {
  res.json({ success: true, data: await listCategories(req.user._id) });
}

async function create(req, res) {
  const body = req.valid.body;
  const userId = req.user._id;

  if (await Category.exists({ userId, nameKey: body.name.toLowerCase() })) {
    throw new ApiError(409, `Kategori "${body.name}" sudah ada`, 'DUPLICATE');
  }
  const isSaving = body.type === 'expense' && body.isSaving;
  const count = await Category.countDocuments({ userId });
  const cat = await Category.create({
    userId,
    name: body.name,
    emoji: body.emoji,
    type: body.type,
    isSaving,
    budgetLimit: body.type === 'expense' && !isSaving ? body.budgetLimit : 0,
    isDefault: false,
    sortOrder: CUSTOM_SORT_BASE + count,
  });
  cache.invalidateUser(userId);
  res.status(201).json({ success: true, message: 'Kategori ditambahkan ✨', data: cat });
}

async function update(req, res) {
  const body = req.valid.body;
  const userId = req.user._id;
  const cat = await Category.findOne({ _id: req.valid.params.id, userId });
  if (!cat) throw new ApiError(404, 'Kategori nggak ditemukan', 'NOT_FOUND');

  const oldName = cat.name;
  if (body.name && body.name.toLowerCase() !== cat.nameKey) {
    if (await Category.exists({ userId, nameKey: body.name.toLowerCase(), _id: { $ne: cat._id } })) {
      throw new ApiError(409, `Kategori "${body.name}" sudah ada`, 'DUPLICATE');
    }
  }
  if (body.name) cat.name = body.name;
  if (body.emoji) cat.emoji = body.emoji;
  if (cat.type === 'expense') {
    if (body.isSaving != null) cat.isSaving = body.isSaving;
    if (body.budgetLimit != null) cat.budgetLimit = body.budgetLimit;
    if (cat.isSaving) cat.budgetLimit = 0; // tabungan tidak punya batas belanja
  }
  await cat.save();

  // Transaksi menyimpan nama kategori, jadi ikut diganti kalau kategori di-rename.
  if (cat.name !== oldName) {
    await Transaction.updateMany({ userId, category: oldName }, { $set: { category: cat.name } });
  }
  cache.invalidateUser(userId);
  res.json({ success: true, message: 'Kategori diperbarui ✏️', data: cat });
}

async function remove(req, res) {
  const userId = req.user._id;
  const cat = await Category.findOne({ _id: req.valid.params.id, userId });
  if (!cat) throw new ApiError(404, 'Kategori nggak ditemukan', 'NOT_FOUND');

  const used = await Transaction.countDocuments({ userId, category: cat.name });
  if (used > 0) {
    throw new ApiError(
      409,
      `Masih ada ${used} transaksi di kategori "${cat.name}". Hapus atau pindahin dulu transaksinya ya.`,
      'CATEGORY_IN_USE',
    );
  }
  await cat.deleteOne();
  cache.invalidateUser(userId);
  res.json({ success: true, message: 'Kategori dihapus 🗑️' });
}

module.exports = { list, create, update, remove };
