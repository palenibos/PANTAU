/** Error yang aman ditampilkan ke user (pesan Bahasa Indonesia + HTTP status). */
class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = ApiError;
