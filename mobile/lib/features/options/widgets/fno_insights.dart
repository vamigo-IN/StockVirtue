import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

class _MoverArgs {
  final String type;
  final String expiry;
  const _MoverArgs(this.type, this.expiry);
  @override
  bool operator ==(Object other) =>
      other is _MoverArgs && other.type == type && other.expiry == expiry;
  @override
  int get hashCode => Object.hash(type, expiry);
}

class _OIArgs {
  final String type;
  final String expiry;
  const _OIArgs(this.type, this.expiry);
  @override
  bool operator ==(Object other) =>
      other is _OIArgs && other.type == type && other.expiry == expiry;
  @override
  int get hashCode => Object.hash(type, expiry);
}

final _fnoMoversProvider =
    FutureProvider.family.autoDispose<List<FnoMover>, _MoverArgs>(
  (ref, args) => ref.watch(marketRepositoryProvider).getFnoMovers(
        type: args.type,
        expiry: args.expiry,
      ),
);

final _oiBuildupProvider =
    FutureProvider.family.autoDispose<List<OIBuildupRow>, _OIArgs>(
  (ref, args) => ref.watch(marketRepositoryProvider).getOIBuildup(
        type: args.type,
        expiry: args.expiry,
      ),
);

/// Two stacked sections on the F&O landing — live F&O gainers/losers (price
/// % and OI %) and OI-buildup classification (long/short built up, long
/// unwinding, short covering). All data is from SmartAPI's marketData feed,
/// not our curated lists.
class FnoInsights extends ConsumerStatefulWidget {
  const FnoInsights({super.key});

  @override
  ConsumerState<FnoInsights> createState() => _FnoInsightsState();
}

class _FnoInsightsState extends ConsumerState<FnoInsights> {
  String _moverType = 'PercPriceGainers';
  String _moverExpiry = 'NEAR';
  String _oiType = 'Long Built Up';

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Header(
          icon: Icons.local_fire_department_outlined,
          color: Color(0xFFEF4444),
          title: 'F&O movers',
          subtitle: 'NSE F&O',
        ),
        const SizedBox(height: 10),
        _MoverTypeTabs(
          selected: _moverType,
          onChanged: (t) => setState(() => _moverType = t),
        ),
        const SizedBox(height: 8),
        _ExpiryTabs(
          selected: _moverExpiry,
          onChanged: (e) => setState(() => _moverExpiry = e),
        ),
        const SizedBox(height: 10),
        _MoversList(
          args: _MoverArgs(_moverType, _moverExpiry),
          isOI: _moverType.contains('OI'),
        ),
        const SizedBox(height: 28),
        const _Header(
          icon: Icons.layers_outlined,
          color: Color(0xFF6366F1),
          title: 'OI buildup',
          subtitle: 'Smart-money positioning',
        ),
        const SizedBox(height: 10),
        _OITypeTabs(
          selected: _oiType,
          onChanged: (t) => setState(() => _oiType = t),
        ),
        const SizedBox(height: 10),
        _OIList(args: _OIArgs(_oiType, 'NEAR')),
      ],
    );
  }
}

// ─── Headers / tabs ─────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(width: 8),
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            subtitle,
            style: TextStyle(
              fontSize: 11.5,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ),
      ],
    );
  }
}

class _MoverTypeTabs extends StatelessWidget {
  const _MoverTypeTabs({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  static const _tabs = <(String, String)>[
    ('PercPriceGainers', 'Price ↑'),
    ('PercPriceLosers', 'Price ↓'),
    ('PercOIGainers', 'OI ↑'),
    ('PercOILosers', 'OI ↓'),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final (value, label) in _tabs)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _SegmentChip(
                label: label,
                selected: value == selected,
                onTap: () => onChanged(value),
              ),
            ),
        ],
      ),
    );
  }
}

class _OITypeTabs extends StatelessWidget {
  const _OITypeTabs({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  static const _tabs = <(String, String, Color)>[
    ('Long Built Up', 'Long buildup', _upColor),
    ('Short Built Up', 'Short buildup', _downColor),
    ('Long Unwinding', 'Long unwind', Color(0xFFF59E0B)),
    ('Short Covering', 'Short covering', Color(0xFF06B6D4)),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final (value, label, tint) in _tabs)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _SegmentChip(
                label: label,
                selected: value == selected,
                onTap: () => onChanged(value),
                tint: tint,
              ),
            ),
        ],
      ),
    );
  }
}

class _ExpiryTabs extends StatelessWidget {
  const _ExpiryTabs({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  static const _values = ['NEAR', 'NEXT', 'FAR'];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          for (final v in _values)
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => onChanged(v),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  decoration: BoxDecoration(
                    color: v == selected
                        ? scheme.primary
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text(
                      v,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                        color: v == selected
                            ? scheme.onPrimary
                            : scheme.onSurface.withValues(alpha: 0.65),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SegmentChip extends StatelessWidget {
  const _SegmentChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.tint,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = tint ?? scheme.primary;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected
              ? active.withValues(alpha: 0.2)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected
                ? active
                : scheme.onSurface.withValues(alpha: 0.7),
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

// ─── Lists ──────────────────────────────────────────────────────────────

class _MoversList extends ConsumerWidget {
  const _MoversList({required this.args, required this.isOI});
  final _MoverArgs args;
  final bool isOI;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_fnoMoversProvider(args));
    final scheme = Theme.of(context).colorScheme;
    return async.when(
      loading: () => const SizedBox(
        height: 120,
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(12),
        child: Text(
          'Movers unavailable — $e',
          style: TextStyle(
            color: scheme.onSurface.withValues(alpha: 0.55),
            fontSize: 12,
          ),
        ),
      ),
      data: (rows) {
        if (rows.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              'No data for this slice',
              style: TextStyle(
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
          );
        }
        final top = rows.take(10).toList();
        return Column(
          children: [
            for (final r in top)
              _MoverRow(
                tradingsymbol: r.tradingsymbol,
                symboltoken: r.symboltoken,
                percentChange: r.percentChange,
                opnInterest: r.opnInterest,
                isOI: isOI,
              ),
          ],
        );
      },
    );
  }
}

class _MoverRow extends StatelessWidget {
  const _MoverRow({
    required this.tradingsymbol,
    required this.symboltoken,
    required this.percentChange,
    required this.opnInterest,
    required this.isOI,
  });
  final String tradingsymbol;
  final String symboltoken;
  final double percentChange;
  final double opnInterest;
  final bool isOI;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = percentChange >= 0;
    final color = isUp ? _upColor : _downColor;
    return _TappableContract(
      tradingsymbol: tradingsymbol,
      symboltoken: symboltoken,
      child: Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tradingsymbol,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                if (isOI && opnInterest != 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'OI ${_compactNum(opnInterest)}',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              '${isUp ? '+' : ''}${percentChange.toStringAsFixed(2)}%',
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
      ),
    );
  }
}

/// Wraps an F&O insights row so tapping opens the contract's detail screen.
/// Movers/OI-buildup are all NSE F&O (NFO) contracts.
class _TappableContract extends StatelessWidget {
  const _TappableContract({
    required this.tradingsymbol,
    required this.symboltoken,
    required this.child,
  });
  final String tradingsymbol;
  final String symboltoken;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: tradingsymbol,
            tradingsymbol: tradingsymbol,
            symboltoken: symboltoken,
            exchange: 'NFO',
          ),
        ),
      ),
      child: child,
    );
  }
}

class _OIList extends ConsumerWidget {
  const _OIList({required this.args});
  final _OIArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_oiBuildupProvider(args));
    final scheme = Theme.of(context).colorScheme;
    return async.when(
      loading: () => const SizedBox(
        height: 120,
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(12),
        child: Text(
          'OI data unavailable — $e',
          style: TextStyle(
            color: scheme.onSurface.withValues(alpha: 0.55),
            fontSize: 12,
          ),
        ),
      ),
      data: (rows) {
        if (rows.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              'No contracts in this category',
              style: TextStyle(
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
          );
        }
        final top = rows.take(10).toList();
        return Column(
          children: [
            for (final r in top)
              _TappableContract(
                tradingsymbol: r.tradingsymbol,
                symboltoken: r.symboltoken,
                child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                decoration: BoxDecoration(
                  color:
                      scheme.surfaceContainerHighest.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: scheme.outlineVariant.withValues(alpha: 0.25),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r.tradingsymbol,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              'LTP ₹${r.ltp.toStringAsFixed(2)} · '
                              'OI ${_compactNum(r.opnInterest)}',
                              style: TextStyle(
                                fontSize: 10.5,
                                color:
                                    scheme.onSurface.withValues(alpha: 0.55),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: (r.percentChange >= 0 ? _upColor : _downColor)
                            .withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${r.percentChange >= 0 ? '+' : ''}${r.percentChange.toStringAsFixed(2)}%',
                        style: TextStyle(
                          color:
                              r.percentChange >= 0 ? _upColor : _downColor,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

String _compactNum(double n) {
  final abs = n.abs();
  if (abs >= 10000000) return '${(n / 10000000).toStringAsFixed(2)}Cr';
  if (abs >= 100000) return '${(n / 100000).toStringAsFixed(2)}L';
  if (abs >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return n.toStringAsFixed(0);
}
