// Semua model, untuk memastikan index (termasuk yang unique) dibuat saat start.
module.exports = [
  require('./User'),
  require('./Transaction'),
  require('./Category'),
  require('./Analysis'),
  require('./Notification'),
];
