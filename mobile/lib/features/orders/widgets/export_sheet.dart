import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../orders_repository.dart';

enum _ExportRange { today, last7, last30, lifetime }

Future<void> showExportSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => const _ExportSheet(),
  );
}

class _ExportSheet extends ConsumerStatefulWidget {
  const _ExportSheet();

  @override
  ConsumerState<_ExportSheet> createState() => _ExportSheetState();
}

class _ExportSheetState extends ConsumerState<_ExportSheet> {
  String _format = 'csv';
  _ExportRange _range = _ExportRange.last30;
  bool _busy = false;
  String? _error;

  ({DateTime? from, DateTime? to}) _resolveRange() {
    final now = DateTime.now();
    switch (_range) {
      case _ExportRange.today:
        return (from: DateTime(now.year, now.month, now.day), to: now);
      case _ExportRange.last7:
        return (from: now.subtract(const Duration(days: 7)), to: now);
      case _ExportRange.last30:
        return (from: now.subtract(const Duration(days: 30)), to: now);
      case _ExportRange.lifetime:
        return (from: null, to: null);
    }
  }

  Future<void> _go() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final range = _resolveRange();
      final export = await ref.read(ordersRepositoryProvider).export(
            format: _format,
            from: range.from,
            to: range.to,
          );
      final xfile = XFile.fromData(
        export.bytes,
        name: export.filename,
        mimeType: export.mime,
      );
      await SharePlus.instance.share(
        ShareParams(
          files: [xfile],
          subject: 'StockVirtue trade history',
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        16,
        24,
        24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: muted,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Export trades',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            'Filled orders only. Useful for tax filing.',
            style: TextStyle(color: muted, fontSize: 12),
          ),
          const SizedBox(height: 20),
          Text('Format', style: TextStyle(color: muted, fontSize: 12)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'csv', label: Text('CSV')),
              ButtonSegment(value: 'json', label: Text('JSON')),
            ],
            selected: {_format},
            onSelectionChanged: (s) => setState(() => _format = s.first),
          ),
          const SizedBox(height: 16),
          Text('Range', style: TextStyle(color: muted, fontSize: 12)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              _rangeChip(_ExportRange.today, 'Today'),
              _rangeChip(_ExportRange.last7, '7 days'),
              _rangeChip(_ExportRange.last30, '30 days'),
              _rangeChip(_ExportRange.lifetime, 'Lifetime'),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy ? null : _go,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.ios_share),
            label: Text(_busy ? 'Preparing…' : 'Share file'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ],
      ),
    );
  }

  Widget _rangeChip(_ExportRange value, String label) {
    return ChoiceChip(
      label: Text(label),
      selected: _range == value,
      onSelected: (_) => setState(() => _range = value),
    );
  }
}
