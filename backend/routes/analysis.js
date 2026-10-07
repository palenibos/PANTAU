const router = require('express').Router();
const validate = require('../middleware/validate');
const { schemas } = require('../utils/validation');
const ctrl = require('../controllers/analysisController');

router.get('/monthly/:month', validate(schemas.monthParam, 'params'), ctrl.monthly);
router.get('/weekly', validate(schemas.weeklyQuery, 'query'), ctrl.weekly);

module.exports = router;
