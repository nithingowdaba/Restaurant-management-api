function notFound(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found', details: [] } });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ success: false, error: { code: err.code || 'INTERNAL_ERROR', message: status === 500 ? 'An unexpected error occurred' : err.message, details: err.details || [] } });
}

module.exports = { notFound, errorHandler };
