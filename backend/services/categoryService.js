const Category = require('../models/Category');

async function seedDefaultCategories(userId) {
  const docs = Category.DEFAULT_CATEGORIES.map((c, i) => ({
    userId,
    name: c.name,
    emoji: c.emoji,
    type: c.type || 'expense',
    isSaving: Boolean(c.isSaving),
    budgetLimit: c.budgetLimit || 0,
    isDefault: true,
    sortOrder: i,
  }));
  await Category.insertMany(docs);
}

const listCategories = (userId) => Category.find({ userId }).sort({ sortOrder: 1, createdAt: 1 }).lean();

module.exports = { seedDefaultCategories, listCategories };
