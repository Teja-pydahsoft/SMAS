export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate entry', field: Object.keys(err.keyPattern)[0] });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}
