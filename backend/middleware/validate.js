const { messages } = require('../utils/validation');
const ApiError = require('../utils/ApiError');

/**
 * Validasi req[source] dengan skema Joi. Hasil (sudah dibersihkan, field asing dibuang)
 * tersedia di req.valid[source] — controller hanya boleh memakai itu, bukan req.body mentah.
 */
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[source] ?? {}, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
      messages,
      errors: { wrap: { label: false } }, // "Password minimal 8 karakter", bukan "\"Password\" minimal..."
    });
    if (error) {
      const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
      return next(new ApiError(400, details[0].message, 'VALIDATION_ERROR', details));
    }
    req.valid = req.valid || {};
    req.valid[source] = value;
    return next();
  };

module.exports = validate;
