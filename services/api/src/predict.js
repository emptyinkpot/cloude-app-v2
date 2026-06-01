// Locally weighted regression (LOESS): for each point, fit a tricube-weighted
// line over its nearest neighbors. Follows real data shape, not a global curve.
export function loessSmooth(values, bandwidth) {
  const n = values.length;
  if (n < 3) return values.slice();
  const halfWindow = Math.max(2, Math.floor((bandwidth * n) / 2));
  const result = new Array(n);

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(n - 1, i + halfWindow);
    const maxDist = Math.max(i - lo, hi - i) || 1;

    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let j = lo; j <= hi; j++) {
      const dist = Math.abs(j - i) / maxDist;
      const t = 1 - dist * dist * dist;
      const w = t > 0 ? t * t * t : 0;
      const x = j;
      const y = values[j];
      sw += w;
      swx += w * x;
      swy += w * y;
      swxx += w * x * x;
      swxy += w * x * y;
    }

    const denom = sw * swxx - swx * swx;
    if (Math.abs(denom) < 1e-9) {
      result[i] = sw > 0 ? swy / sw : values[i];
    } else {
      const slope = (sw * swxy - swx * swy) / denom;
      const intercept = (swy - slope * swx) / sw;
      result[i] = intercept + slope * i;
    }
  }

  return result;
}

export function estimateRecentTrend(values, rows) {
  const windowSize = Math.min(values.length, 24);
  const start = values.length - windowSize;
  const window = values.slice(start);
  if (window.length < 2) return 0;

  const xs = rows.slice(start).map((row) => new Date(row.ts).getTime() / 60000);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = window.reduce((sum, value) => sum + value, 0) / window.length;
  let numerator = 0;
  let denominator = 0;

  window.forEach((value, i) => {
    const dx = xs[i] - meanX;
    numerator += dx * (value - meanY);
    denominator += dx * dx;
  });

  const slopePerMin = denominator > 0 ? numerator / denominator : 0;
  const intervalMs = rows.length > 1
    ? new Date(rows[rows.length - 1].ts).getTime() - new Date(rows[rows.length - 2].ts).getTime()
    : 5000;
  const samplesPerMin = 60000 / Math.max(1000, intervalMs);
  return Math.max(-24, Math.min(24, slopePerMin / samplesPerMin));
}

// --- Holt-Winters double exponential smoothing ---
export function holtWinters(data, alpha = 0.3, beta = 0.1, horizon = 30) {
  if (data.length < 2) return [];
  let level = data[0];
  let trend = data[1] - data[0];

  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const predictions = [];
  for (let i = 1; i <= horizon; i++) {
    predictions.push(Math.round(level + trend * i));
  }
  return predictions;
}

export function predictionErrorMetrics(minuteData) {
  if (minuteData.length < 4) {
    return { mae: null, rmse: null, samples: 0, basis: "rolling_1min_backtest" };
  }
  const errors = [];
  for (let i = 3; i < minuteData.length; i++) {
    const train = minuteData.slice(0, i);
    const forecast = holtWinters(train, 0.4, 0.15, 1)[0];
    if (Number.isFinite(forecast)) {
      errors.push(forecast - minuteData[i]);
    }
  }
  if (errors.length === 0) {
    return { mae: null, rmse: null, samples: 0, basis: "rolling_1min_backtest" };
  }
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  return {
    mae: Math.round(mae * 10) / 10,
    rmse: Math.round(rmse * 10) / 10,
    samples: errors.length,
    basis: "rolling_1min_backtest"
  };
}

export function aggregateBySampleWindow(data, windowSize) {
  const buckets = [];
  for (let i = 0; i < data.length; i += windowSize) {
    const slice = data.slice(i, i + windowSize);
    if (slice.length > 0) {
      buckets.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
    }
  }
  return buckets;
}

// --- Adaptive regression: picks best model (linear vs quadratic) on short window ---
export function adaptiveRegression(data) {
  const n = data.length;
  if (n < 3) return { slope: 0, accel: 0, r2: 0, model: "none" };

  // Linear regression
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += data[i]; sxy += i * data[i]; sx2 += i * i;
  }
  const linDenom = n * sx2 - sx * sx;
  let linB = 0, linA = 0;
  if (Math.abs(linDenom) > 1e-6) {
    linB = (n * sxy - sx * sy) / linDenom;
    linA = (sy - linB * sx) / n;
  }
  let linSsRes = 0, ssTot = 0;
  const mean = sy / n;
  for (let i = 0; i < n; i++) {
    linSsRes += (data[i] - (linA + linB * i)) ** 2;
    ssTot += (data[i] - mean) ** 2;
  }
  const linR2 = ssTot > 0 ? Math.max(0, 1 - linSsRes / ssTot) : 1;

  // Quadratic regression
  let qsx = 0, qsx2 = 0, qsx3 = 0, qsx4 = 0;
  let qsy = 0, qsxy = 0, qsx2y = 0;
  for (let i = 0; i < n; i++) {
    qsx += i; qsx2 += i*i; qsx3 += i*i*i; qsx4 += i*i*i*i;
    qsy += data[i]; qsxy += i*data[i]; qsx2y += i*i*data[i];
  }
  const qd = n*(qsx2*qsx4-qsx3*qsx3) - qsx*(qsx*qsx4-qsx3*qsx2) + qsx2*(qsx*qsx3-qsx2*qsx2);
  let qa = 0, qb = 0, qc = 0;
  if (Math.abs(qd) > 1e-6) {
    qc = (qsy*(qsx2*qsx4-qsx3*qsx3)-qsx*(qsxy*qsx4-qsx2y*qsx3)+qsx2*(qsxy*qsx3-qsx2y*qsx2))/qd;
    qb = (n*(qsxy*qsx4-qsx2y*qsx3)-qsy*(qsx*qsx4-qsx3*qsx2)+qsx2*(qsx*qsx2y-qsxy*qsx2))/qd;
    qa = (n*(qsx2*qsx2y-qsx3*qsxy)-qsx*(qsx*qsx2y-qsxy*qsx2)+qsy*(qsx*qsx3-qsx2*qsx2))/qd;
  }
  let quadSsRes = 0;
  for (let i = 0; i < n; i++) {
    quadSsRes += (data[i] - (qa*i*i + qb*i + qc)) ** 2;
  }
  const quadR2 = ssTot > 0 ? Math.max(0, 1 - quadSsRes / ssTot) : 1;

  if (quadR2 > linR2 && quadR2 > 0.7) {
    const deriv1 = 2 * qa * (n - 1) + qb;
    const deriv2 = 2 * qa;
    return { slope: deriv1, accel: deriv2, r2: quadR2, model: "quadratic", a: qa, b: qb, c: qc };
  }
  return { slope: linB, accel: 0, r2: linR2, model: "linear", a: 0, b: linB, c: linA };
}

// --- Pearson correlation ---
export function pearsonCorr(x, y) {
  const n = x.length;
  if (n < 3) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sx2 += (x[i] - mx) ** 2;
    sy2 += (y[i] - my) ** 2;
  }
  if (sx2 < 1 || sy2 < 1) return 0;
  return sxy / Math.sqrt(sx2 * sy2);
}

