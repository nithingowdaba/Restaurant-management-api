function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function single(res, data, status = 200) { return res.status(status).json({ success: true, data }); }
function collection(res, data, page, limit, total) {
  return res.json({ success: true, data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}
function httpError(status, code, message, details = []) { return Object.assign(new Error(message), { status, code, details }); }
module.exports = { asyncHandler, single, collection, httpError };
