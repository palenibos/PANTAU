const router = require('express').Router();
const validate = require('../middleware/validate');
const { schemas } = require('../utils/validation');
const ctrl = require('../controllers/settingsController');

router.get('/', ctrl.get);
router.put('/', validate(schemas.settingsUpdate), ctrl.update);
router.put('/budget/:categoryId', validate(schemas.categoryIdParam, 'params'), validate(schemas.budgetUpdate), ctrl.updateBudget);
router.get('/export', validate(schemas.exportQuery, 'query'), ctrl.exportData);
router.delete('/data', validate(schemas.resetData), ctrl.resetData);

module.exports = router;
