'use strict';

/**
 * Standardised API response envelope.
 * Every response follows: { success, message, data?, meta?, errors? }
 */

const ok = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
};

const created = (res, data, message = 'Created successfully') =>
  ok(res, data, message, 201);

const fail = (res, message = 'Something went wrong', statusCode = 400, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const unauthorized = (res, message = 'Unauthorized') =>
  fail(res, message, 401);

const forbidden = (res, message = 'Forbidden') =>
  fail(res, message, 403);

const notFound = (res, message = 'Resource not found') =>
  fail(res, message, 404);

const serverError = (res, message = 'Internal server error') =>
  fail(res, message, 500);

const paginate = (res, data, total, page, limit, message = 'Success') =>
  ok(res, data, message, 200, {
    total,
    page:       Number(page),
    limit:      Number(limit),
    totalPages: Math.ceil(total / limit),
  });

module.exports = { ok, created, fail, unauthorized, forbidden, notFound, serverError, paginate };
