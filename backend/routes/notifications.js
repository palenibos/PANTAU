const router = require('express').Router();
const validate = require('../middleware/validate');
const { schemas } = require('../utils/validation');
const ctrl = require('../controllers/notificationController');

router.get('/', validate(schemas.notificationQuery, 'query'), ctrl.list);
router.put('/read', ctrl.markAllRead);

module.exports = router;
