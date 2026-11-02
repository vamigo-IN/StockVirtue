import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/preferences.dart';
import '../../../data/models/order.dart';
import '../../auth/auth_controller.dart';
import '../../news/news_repository.dart';
import '../../notifications/notifications_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final notifier = ref.read(preferencesProvider.notifier);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Settings',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          _SectionTitle('Trading'),
          _SettingsCard(
            children: [
              _ChoiceRow<OrderType>(
                icon: Icons.bolt_outlined,
                label: 'Default order type',
                hint: 'Used when opening the trade sheet',
                value: prefs.defaultOrderType,
                options: const [
                  (OrderType.market, 'Market'),
                  (OrderType.limit, 'Limit'),
                  (OrderType.stopLoss, 'Stop loss (SL-M)'),
                  (OrderType.stopLossLimit, 'Stop loss limit (SL-L)'),
                  (OrderType.trailingStop, 'Trailing stop'),
                ],
                onChanged: notifier.setDefaultOrderType,
              ),
              const _Divider(),
              _ChoiceRow<OrderProduct>(
                icon: Icons.inventory_2_outlined,
                label: 'Default product',
                hint: 'Delivery (CNC) holds across days; Intraday (MIS) squares at 15:20 IST',
                value: prefs.defaultProduct,
                options: const [
                  (OrderProduct.delivery, 'Delivery (CNC)'),
                  (OrderProduct.intraday, 'Intraday (MIS)'),
                ],
                onChanged: notifier.setDefaultProduct,
              ),
            ],
          ),
          const SizedBox(height: 18),
          _SectionTitle('Notifications'),
          _SettingsCard(
            children: [
              for (final entry in _notifKindEntries)
                _NotifToggleRow(
                  kind: entry.$1,
                  label: entry.$2,
                  hint: entry.$3,
                  muted: prefs.isMuted(entry.$1),
                  onChanged: (muted) =>
                      notifier.setMuted(entry.$1, muted),
                ),
            ],
          ),
          const SizedBox(height: 18),
          _SectionTitle('News alerts'),
          _SettingsCard(children: const [_NewsAlertToggles()]),
          const SizedBox(height: 18),
          _SectionTitle('Email'),
          _SettingsCard(
            children: const [_TradeEmailToggle()],
          ),
          const SizedBox(height: 18),
          _SectionTitle('Push & offline'),
          _SettingsCard(
            children: const [
              _DeferredRow(
                icon: Icons.notifications_active_outlined,
                label: 'Push notifications',
                hint:
                    'On. This device is registered for push, so order fills, '
                    'price alerts, news alerts, market-close reminders and '
                    'updates arrive even when the app is closed. Mute '
                    'categories above.',
              ),
              _Divider(),
              _DeferredRow(
                icon: Icons.cloud_off_outlined,
                label: 'Offline mode',
                hint:
                    'Portfolio, watchlists, and orders use stale-on-error '
                    'caching automatically. No toggle needed.',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Section helpers ──────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 6, 4, 10),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: Theme.of(context)
              .colorScheme
              .onSurface
              .withValues(alpha: 0.55),
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(children: children),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 1,
      margin: const EdgeInsets.symmetric(horizontal: 14),
      color: Theme.of(context)
          .colorScheme
          .outlineVariant
          .withValues(alpha: 0.2),
    );
  }
}

// ─── Reusable rows ────────────────────────────────────────────────────────

class _ChoiceRow<T> extends StatelessWidget {
  const _ChoiceRow({
    required this.icon,
    required this.label,
    required this.hint,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final String hint;
  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final currentLabel =
        options.firstWhere((o) => o.$1 == value, orElse: () => options.first).$2;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () async {
        final picked = await showModalBottomSheet<T>(
          context: context,
          showDragHandle: true,
          builder: (ctx) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 20),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
                for (final opt in options)
                  ListTile(
                    title: Text(opt.$2),
                    trailing: opt.$1 == value
                        ? Icon(
                            Icons.check_circle,
                            color: Theme.of(ctx).colorScheme.primary,
                          )
                        : Icon(
                            Icons.circle_outlined,
                            color: Theme.of(ctx)
                                .colorScheme
                                .onSurface
                                .withValues(alpha: 0.35),
                          ),
                    onTap: () => Navigator.of(ctx).pop(opt.$1),
                  ),
              ],
            ),
          ),
        );
        if (picked != null && picked != value) onChanged(picked);
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(icon, color: scheme.primary, size: 16),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hint,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                currentLabel,
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                  color: scheme.primary,
                ),
              ),
            ),
            Icon(
              Icons.chevron_right,
              color: scheme.onSurface.withValues(alpha: 0.5),
              size: 18,
            ),
          ],
        ),
      ),
    );
  }
}

/// Server-backed toggle for the per-trade email opt-in (off by default).
class _TradeEmailToggle extends ConsumerWidget {
  const _TradeEmailToggle();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final user = ref.watch(authControllerProvider).value;
    final enabled = user?.tradeEmailsOptIn ?? false;
    return SwitchListTile.adaptive(
      value: enabled,
      onChanged: user == null
          ? null
          : (v) async {
              try {
                await ref
                    .read(authControllerProvider.notifier)
                    .setTradeEmails(v);
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Could not update email preference'),
                    ),
                  );
                }
              }
            },
      title: const Text(
        'Email me on every trade',
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
      ),
      subtitle: Text(
        'Off by default. Referral and security emails are always sent.',
        style: TextStyle(
          fontSize: 11.5,
          color: scheme.onSurface.withValues(alpha: 0.6),
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14),
      dense: true,
    );
  }
}

/// Breaking-news and followed-stock pushes. Saved on the account (the
/// server decides who gets each push), so they apply on every device.
class _NewsAlertToggles extends ConsumerWidget {
  const _NewsAlertToggles();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(newsAlertsProvider);
    final alerts = async.value;
    final hint = TextStyle(
      fontSize: 11.5,
      color: scheme.onSurface.withValues(alpha: 0.6),
    );
    Future<void> save({bool? breaking, bool? followedStocks}) async {
      try {
        await ref
            .read(newsAlertsProvider.notifier)
            .set(breaking: breaking, followedStocks: followedStocks);
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not update news alerts')),
          );
        }
      }
    }

    if (alerts == null) {
      return ListTile(
        dense: true,
        title: Text(
          async.hasError
              ? 'News alerts can’t be loaded right now.'
              : 'Loading news alerts…',
          style: hint,
        ),
        trailing: async.hasError
            ? TextButton(
                onPressed: () => ref.invalidate(newsAlertsProvider),
                child: const Text('Retry'),
              )
            : null,
      );
    }
    final n = alerts.followedCount;
    return Column(
      children: [
        SwitchListTile.adaptive(
          value: alerts.breaking,
          onChanged: (v) => save(breaking: v),
          title: const Text(
            'Breaking news',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
          ),
          subtitle: Text('Major market stories, as they happen.', style: hint),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14),
          dense: true,
        ),
        const _Divider(),
        SwitchListTile.adaptive(
          value: alerts.followedStocks,
          onChanged: (v) => save(followedStocks: v),
          title: const Text(
            'Stocks you follow',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
          ),
          subtitle: Text(
            n == 0
                ? 'Stories about stocks in your watchlists and portfolio.'
                : 'Stories about the $n ${n == 1 ? 'stock' : 'stocks'} in your watchlists and portfolio.',
            style: hint,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14),
          dense: true,
        ),
      ],
    );
  }
}

class _NotifToggleRow extends StatelessWidget {
  const _NotifToggleRow({
    required this.kind,
    required this.label,
    required this.hint,
    required this.muted,
    required this.onChanged,
  });

  final AppNotificationKind kind;
  final String label;
  final String hint;
  final bool muted;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SwitchListTile.adaptive(
      value: !muted, // UI shows "enabled" but storage holds "muted"
      onChanged: (v) => onChanged(!v),
      title: Text(
        label,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
      ),
      subtitle: Text(
        hint,
        style: TextStyle(
          fontSize: 11.5,
          color: scheme.onSurface.withValues(alpha: 0.6),
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14),
      dense: true,
    );
  }
}

class _DeferredRow extends StatelessWidget {
  const _DeferredRow({
    required this.icon,
    required this.label,
    required this.hint,
  });

  final IconData icon;
  final String label;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.surface.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              icon,
              color: scheme.onSurface.withValues(alpha: 0.5),
              size: 16,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: scheme.tertiary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'AUTO',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5,
                          color: scheme.tertiary,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  hint,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

const _notifKindEntries = <(AppNotificationKind, String, String)>[
  (
    AppNotificationKind.orderPlaced,
    'Order placed',
    'When a pending order is accepted by the trade engine',
  ),
  (
    AppNotificationKind.orderFilled,
    'Order filled',
    'When a market order or triggered limit/SL fills',
  ),
  (
    AppNotificationKind.orderCancelled,
    'Order cancelled',
    'When you cancel a pending order',
  ),
  (
    AppNotificationKind.orderRejected,
    'Order rejected',
    'When the trade engine rejects an order',
  ),
  (
    AppNotificationKind.priceAlert,
    'Price alerts',
    'When a saved price alert triggers',
  ),
  (
    AppNotificationKind.positionAutoSquare,
    'Intraday auto-square',
    'When MIS positions are squared off at 15:20 IST',
  ),
  (
    AppNotificationKind.expirySettlement,
    'F&O expiry settlement',
    'When expiring contracts close on the settlement run',
  ),
  (
    AppNotificationKind.info,
    'Info (badges, news, etc.)',
    'Achievement unlocks and miscellaneous app messages',
  ),
];
