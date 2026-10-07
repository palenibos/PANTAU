const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(new ApiError(404, 'Endpoint nggak ditemukan', 'NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let { status = 500, message, code, details } = err;

  if (err.name === 'CastError') {
    status = 400;
    message = 'ID atau format data nggak valid';
    code = 'BAD_REQUEST';
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = Object.values(err.errors)[0].message;
    code = 'VALIDATION_ERROR';
  } else if (err.code === 11000) {
    status = 409;
    message = 'Data itu sudah ada';
    code = 'DUPLICATE';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Format JSON nggak valid';
    code = 'BAD_JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Data terlalu besar';
    code = 'TOO_LARGE';
  }

  if (!(err instanceof ApiError) && status >= 500) {
    if (!env.isTest) console.error('[error]', req.method, req.originalUrl, err);
    message = 'Ups, ada masalah di server. Coba lagi sebentar ya 🙏';
    code = 'SERVER_ERROR';
    details = undefined;
  }

  res.status(status).json({ success: false, message, code, ...(details ? { errors: details } : {}) });
}

module.exports = { notFound, errorHandler };
