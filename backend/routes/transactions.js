const router = require('express').Router();
const validate = require('../middleware/validate');
const { schemas } = require('../utils/validation');
const ctrl = require('../controllers/transactionController');

router.get('/', validate(schemas.transactionQuery, 'query'), ctrl.list);
router.post('/', validate(schemas.transactionCreate), ctrl.create);
router.put('/:id', validate(schemas.idParam, 'params'), validate(schemas.transactionUpdate), ctrl.update);
router.delete('/:id', validate(schemas.idParam, 'params'), ctrl.remove);

module.exports = router;
