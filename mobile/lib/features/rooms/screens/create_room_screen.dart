import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/room.dart';
import '../rooms_repository.dart';

/// Form to spin up a new room. Mode picker switches between three
/// flavours that map onto the backend's flag combinations:
///   * Private  → isPublic=false, isTournament=false
///   * Public   → isPublic=true,  isTournament=false
///   * Tourney  → isPublic=true,  isTournament=true (requires window)
class CreateRoomScreen extends ConsumerStatefulWidget {
  const CreateRoomScreen({super.key});

  @override
  ConsumerState<CreateRoomScreen> createState() => _CreateRoomScreenState();
}

enum _RoomMode { private, publicEvergreen, tournament }

class _CreateRoomScreenState extends ConsumerState<CreateRoomScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameC = TextEditingController();
  final _descC = TextEditingController();
  final _maxC = TextEditingController(text: '0');
  _RoomMode _mode = _RoomMode.private;
  // Default tournament window: starts tomorrow 9:15 IST, ends in 7 days.
  DateTime _startsAt = _defaultStart();
  DateTime _endsAt = _defaultStart().add(const Duration(days: 7));
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameC.dispose();
    _descC.dispose();
    _maxC.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_mode == _RoomMode.tournament && !_endsAt.isAfter(_startsAt)) {
      setState(() => _error = 'Tournament end must be after start');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final input = CreateRoomInput(
        name: _nameC.text.trim(),
        description: _descC.text.trim().isEmpty ? null : _descC.text.trim(),
        isPublic: _mode != _RoomMode.private,
        isTournament: _mode == _RoomMode.tournament,
        startsAt: _mode == _RoomMode.tournament ? _startsAt : null,
        endsAt: _mode == _RoomMode.tournament ? _endsAt : null,
        maxMembers: int.tryParse(_maxC.text.trim()) ?? 0,
      );
      final created =
          await ref.read(roomsRepositoryProvider).create(input);
      if (mounted) Navigator.of(context).pop<RoomSummary>(created);
    } on DioException catch (e) {
      setState(() => _error = _extractError(e));
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickStart() async {
    final picked = await _pickDateTime(context, _startsAt);
    if (picked != null) {
      setState(() {
        _startsAt = picked;
        if (!_endsAt.isAfter(_startsAt)) {
          _endsAt = _startsAt.add(const Duration(days: 7));
        }
      });
    }
  }

  Future<void> _pickEnd() async {
    final picked = await _pickDateTime(context, _endsAt);
    if (picked != null) setState(() => _endsAt = picked);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Create room',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _ModePicker(
                mode: _mode,
                onChanged: (m) => setState(() => _mode = m),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _nameC,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Room name',
                  hintText: 'e.g. Office crew · weekly trade-off',
                  prefixIcon: Icon(Icons.workspaces_outline),
                ),
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.length < 3) return 'At least 3 characters';
                  if (t.length > 60) return 'Too long';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _descC,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  hintText: 'What\'s the vibe? Rules, theme, anything.',
                  prefixIcon: Icon(Icons.notes),
                ),
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _maxC,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Max members (0 = unlimited)',
                  prefixIcon: Icon(Icons.group_outlined),
                ),
                validator: (v) {
                  final n = int.tryParse((v ?? '').trim());
                  if (n == null || n < 0 || n > 1000) {
                    return 'Enter 0 (unlimited) or 1–1000';
                  }
                  return null;
                },
              ),
              if (_mode == _RoomMode.tournament) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.emoji_events_outlined,
                            color: Color(0xFFF59E0B),
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Tournament window',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: scheme.onSurface.withValues(alpha: 0.85),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'After it starts no new members can join. The '
                        'leaderboard freezes at the end time.',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: scheme.onSurface.withValues(alpha: 0.6),
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _DateRow(
                        label: 'Starts',
                        value: _startsAt,
                        onTap: _pickStart,
                      ),
                      const SizedBox(height: 8),
                      _DateRow(
                        label: 'Ends',
                        value: _endsAt,
                        onTap: _pickEnd,
                      ),
                    ],
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.redAccent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      color: Colors.redAccent,
                      fontSize: 12.5,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _saving ? null : _submit,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(
                        'Create room',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModePicker extends StatelessWidget {
  const _ModePicker({required this.mode, required this.onChanged});
  final _RoomMode mode;
  final ValueChanged<_RoomMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Room type',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color:
                Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: _ModeChip(
                label: 'Private',
                subtitle: 'Invite-only',
                icon: Icons.lock_outline,
                selected: mode == _RoomMode.private,
                onTap: () => onChanged(_RoomMode.private),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ModeChip(
                label: 'Public',
                subtitle: 'Anyone can join',
                icon: Icons.public,
                selected: mode == _RoomMode.publicEvergreen,
                onTap: () => onChanged(_RoomMode.publicEvergreen),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ModeChip(
                label: 'Tourney',
                subtitle: 'Time-bounded',
                icon: Icons.emoji_events_outlined,
                selected: mode == _RoomMode.tournament,
                onTap: () => onChanged(_RoomMode.tournament),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final String subtitle;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
        decoration: BoxDecoration(
          color: selected
              ? scheme.primary.withValues(alpha: 0.18)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? scheme.primary.withValues(alpha: 0.5)
                : scheme.outlineVariant.withValues(alpha: 0.3),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 18,
              color: selected ? scheme.primary : scheme.onSurface,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 12.5,
                color: selected ? scheme.primary : null,
              ),
            ),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 10.5,
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateRow extends StatelessWidget {
  const _DateRow({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final DateTime value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Ink(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.surface.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.event_outlined,
              size: 14,
              color: scheme.onSurface.withValues(alpha: 0.7),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '$label · ${_fmt(value)}',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Icon(
              Icons.edit,
              size: 12,
              color: scheme.onSurface.withValues(alpha: 0.5),
            ),
          ],
        ),
      ),
    );
  }
}

DateTime _defaultStart() {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day + 1, 9, 15);
}

Future<DateTime?> _pickDateTime(BuildContext context, DateTime initial) async {
  final date = await showDatePicker(
    context: context,
    initialDate: initial,
    // No back-dating — the backend rejects a tournament startsAt in the past.
    firstDate: DateTime.now(),
    lastDate: DateTime.now().add(const Duration(days: 365)),
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(initial),
  );
  if (time == null) return null;
  return DateTime(date.year, date.month, date.day, time.hour, time.minute);
}

String _fmt(DateTime d) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final h12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final m = d.minute.toString().padLeft(2, '0');
  final ampm = d.hour >= 12 ? 'PM' : 'AM';
  return '${d.day} ${months[d.month - 1]} ${d.year} · $h12:$m $ampm';
}

String _extractError(DioException e) {
  final body = e.response?.data;
  if (body is Map) {
    final m = body['message'];
    if (m is String) return m;
    if (m is List && m.isNotEmpty) return m.first.toString();
  }
  return e.message ?? 'Failed to create room';
}
