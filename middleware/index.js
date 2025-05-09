const { protect, authorize } = require('./auth');
const { errorHandler, ErrorResponse } = require('./error');

module.exports = {
  protect,
  authorize,
  errorHandler,
  ErrorResponse
}; 