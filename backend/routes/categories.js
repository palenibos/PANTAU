const router = require('express').Router();
const validate = require('../middleware/validate');
const { schemas } = require('../utils/validation');
const ctrl = require('../controllers/categoryController');

router.get('/', ctrl.list);
router.post('/', validate(schemas.categoryCreate), ctrl.create);
router.put('/:id', validate(schemas.idParam, 'params'), validate(schemas.categoryUpdate), ctrl.update);
router.delete('/:id', validate(schemas.idParam, 'params'), ctrl.remove);

module.exports = router;
