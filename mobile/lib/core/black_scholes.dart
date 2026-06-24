/// Black-Scholes-Merton pricing + greeks for European-style options.
/// Indian index options (NIFTY, BANKNIFTY) are European-cash-settled, so
/// BSM matches the official model. Single-stock options are American but
/// BSM is a close-enough approximation for educational greeks display.
///
/// All inputs are in their natural units:
///   * S — underlying spot
///   * K — strike
///   * T — time to expiry in years (e.g. 7 days → 7/365)
///   * r — annual risk-free rate (decimal, e.g. 0.065)
///   * q — annual dividend yield (decimal; ~0 for indices, ~0.015 for stocks)
///   * sigma — annualised volatility (decimal, e.g. 0.18 = 18%)
library;

import 'dart:math' as math;

enum OptionRight { call, put }

class OptionGreeks {
  /// Theoretical price under BSM.
  final double price;
  final double delta;
  final double gamma;
  /// Per-day theta — already divided by 365 so the number is "₹ lost per day".
  final double theta;
  /// Vega per 1 vol-point (i.e. multiplied by 0.01 already).
  final double vega;
  /// Rho per 1% rate change (multiplied by 0.01 already).
  final double rho;
  /// Implied volatility used for these greeks. NaN when the IV solver
  /// failed (deep ITM/OTM at near-zero time, etc.).
  final double iv;

  const OptionGreeks({
    required this.price,
    required this.delta,
    required this.gamma,
    required this.theta,
    required this.vega,
    required this.rho,
    required this.iv,
  });
}

/// Standard normal probability density.
double _phi(double x) =>
    math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi);

/// Cumulative standard normal — Abramowitz & Stegun 7.1.26, accurate
/// to ~1.5×10⁻⁷ across the real line.
double _normCdf(double x) {
  if (x.isNaN || !x.isFinite) return double.nan;
  // erf via A&S 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  final sign = x < 0 ? -1.0 : 1.0;
  final ax = x.abs() / math.sqrt2;
  final t = 1.0 / (1.0 + p * ax);
  final y = 1.0 -
      (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t *
          math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

class BlackScholes {
  /// BSM price for [right] at the supplied parameters.
  static double price({
    required OptionRight right,
    required double S,
    required double K,
    required double T,
    required double r,
    required double q,
    required double sigma,
  }) {
    if (T <= 0) {
      // Exercise value at expiry.
      return right == OptionRight.call
          ? math.max(S - K, 0.0)
          : math.max(K - S, 0.0);
    }
    if (sigma <= 0 || S <= 0 || K <= 0) return double.nan;
    final sqrtT = math.sqrt(T);
    final d1 =
        (math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    final d2 = d1 - sigma * sqrtT;
    final eRT = math.exp(-r * T);
    final eQT = math.exp(-q * T);
    if (right == OptionRight.call) {
      return S * eQT * _normCdf(d1) - K * eRT * _normCdf(d2);
    }
    return K * eRT * _normCdf(-d2) - S * eQT * _normCdf(-d1);
  }

  /// Full greeks bundle for [right]. [marketPrice] (the current LTP) seeds
  /// the IV solver; pass null to compute greeks at the supplied [sigma]
  /// instead.
  static OptionGreeks greeks({
    required OptionRight right,
    required double S,
    required double K,
    required double T,
    required double r,
    required double q,
    double? marketPrice,
    double sigma = 0.2,
  }) {
    final iv = marketPrice != null
        ? impliedVolatility(
            right: right,
            S: S,
            K: K,
            T: T,
            r: r,
            q: q,
            marketPrice: marketPrice,
          )
        : sigma;
    if (iv.isNaN || iv <= 0 || T <= 0) {
      return OptionGreeks(
        price: marketPrice ?? 0,
        delta: right == OptionRight.call
            ? (S > K ? 1 : 0).toDouble()
            : (S < K ? -1 : 0).toDouble(),
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
        iv: double.nan,
      );
    }
    final sqrtT = math.sqrt(T);
    final d1 =
        (math.log(S / K) + (r - q + 0.5 * iv * iv) * T) / (iv * sqrtT);
    final d2 = d1 - iv * sqrtT;
    final eRT = math.exp(-r * T);
    final eQT = math.exp(-q * T);
    final phiD1 = _phi(d1);

    final delta = right == OptionRight.call
        ? eQT * _normCdf(d1)
        : -eQT * _normCdf(-d1);
    final gamma = (eQT * phiD1) / (S * iv * sqrtT);
    // Theta — annualised, then divide by 365 for "per-day" units.
    final firstTerm = -(S * eQT * phiD1 * iv) / (2 * sqrtT);
    final thetaAnnual = right == OptionRight.call
        ? firstTerm - r * K * eRT * _normCdf(d2) + q * S * eQT * _normCdf(d1)
        : firstTerm + r * K * eRT * _normCdf(-d2) - q * S * eQT * _normCdf(-d1);
    final theta = thetaAnnual / 365.0;
    // Vega — per 1 vol-point (so multiply the BSM ∂P/∂σ by 0.01).
    final vega = S * eQT * phiD1 * sqrtT * 0.01;
    // Rho — per 1% rate change.
    final rho = (right == OptionRight.call
            ? K * T * eRT * _normCdf(d2)
            : -K * T * eRT * _normCdf(-d2)) *
        0.01;
    final theoPrice = price(
      right: right,
      S: S,
      K: K,
      T: T,
      r: r,
      q: q,
      sigma: iv,
    );

    return OptionGreeks(
      price: theoPrice,
      delta: delta,
      gamma: gamma,
      theta: theta,
      vega: vega,
      rho: rho,
      iv: iv,
    );
  }

  /// Newton-Raphson with bisection fallback. Returns NaN if no IV in
  /// [1e-4, 5.0] makes the BSM price match within the tolerance.
  static double impliedVolatility({
    required OptionRight right,
    required double S,
    required double K,
    required double T,
    required double r,
    required double q,
    required double marketPrice,
  }) {
    if (T <= 0 || marketPrice <= 0) return double.nan;
    // Quick arbitrage bounds check: option price can't be below intrinsic.
    final intrinsic = right == OptionRight.call
        ? math.max(S * math.exp(-q * T) - K * math.exp(-r * T), 0.0)
        : math.max(K * math.exp(-r * T) - S * math.exp(-q * T), 0.0);
    if (marketPrice < intrinsic - 0.01) return double.nan;

    var sigma = 0.2;
    const tol = 1e-4;
    const maxIter = 60;
    for (var i = 0; i < maxIter; i++) {
      final p = price(
        right: right,
        S: S,
        K: K,
        T: T,
        r: r,
        q: q,
        sigma: sigma,
      );
      final diff = p - marketPrice;
      if (diff.abs() < tol) return sigma;
      // ∂P/∂σ = vega (unscaled, before the 0.01 factor).
      final sqrtT = math.sqrt(T);
      final d1 =
          (math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) /
              (sigma * sqrtT);
      final vega = S * math.exp(-q * T) * _phi(d1) * sqrtT;
      if (vega < 1e-8) break; // Newton step would explode → fall through
      sigma -= diff / vega;
      if (sigma <= 0 || sigma > 5) break;
    }
    // Bisection fallback over a generous range.
    var lo = 1e-4;
    var hi = 5.0;
    for (var i = 0; i < 80; i++) {
      final mid = 0.5 * (lo + hi);
      final p =
          price(right: right, S: S, K: K, T: T, r: r, q: q, sigma: mid);
      if (p.isNaN) return double.nan;
      if ((p - marketPrice).abs() < tol) return mid;
      if (p < marketPrice) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return double.nan;
  }
}
