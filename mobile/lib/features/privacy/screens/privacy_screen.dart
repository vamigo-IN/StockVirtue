import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/error_mapper.dart';
import '../../auth/auth_controller.dart';
import '../privacy_repository.dart';
import '../widgets/consent_box.dart';
import 'delete_account_screen.dart';

String _day(BuildContext context, DateTime? d) => d == null
    ? '—'
    : MaterialLocalizations.of(context).formatMediumDate(d.toLocal());

/// "Privacy & your data" (DPDP Act 2023): every right in one place: the
/// notice, the analytics choice, downloading the data, a nominee, requests
/// and complaints, who answers them, and deleting the account.
class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(privacyStatusProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Privacy & your data',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: status.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(friendlyError(e), textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => ref.invalidate(privacyStatusProvider),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        data: (s) => RefreshIndicator(
          onRefresh: () async {
            ref
              ..invalidate(privacyStatusProvider)
              ..invalidate(privacyRequestsProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              const _Section('The notice'),
              _Tile(
                icon: Icons.description_outlined,
                title: 'Privacy notice',
                subtitle: 'What we collect, why, and for how long',
                onTap: () => openWebPage(context, privacyNoticeUrl),
              ),
              _Tile(
                icon: Icons.translate,
                title: 'गोपनीयता सूचना (हिंदी)',
                subtitle: 'The privacy notice in Hindi',
                onTap: () => openWebPage(context, privacyNoticeHindiUrl),
              ),
              const _Section('Your choices'),
              _AnalyticsSwitch(allowed: s.analytics),
              const _Section('Your data'),
              const _DownloadTile(),
              _NomineeTile(nominee: s.nominee),
              const _Section('Requests and complaints'),
              _RequestsTile(open: s.openRequests),
              _ContactCard(info: s.info),
              const _Section('Leave StockVirtue'),
              _Tile(
                icon: Icons.delete_outline,
                title: 'Delete my account',
                subtitle: 'Closes it at once; erased for good after a year',
                danger: true,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const DeleteAccountScreen(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 11.5,
          letterSpacing: 0.8,
          fontWeight: FontWeight.w800,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.trailing,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = danger ? Colors.redAccent : scheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        child: ListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          leading: Icon(icon, color: color),
          title: Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: danger ? Colors.redAccent : null,
            ),
          ),
          subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
          trailing: trailing ??
              (onTap != null ? const Icon(Icons.chevron_right, size: 18) : null),
          onTap: onTap,
        ),
      ),
    );
  }
}

/// App analytics, off unless the person turns it on (and off as easily).
class _AnalyticsSwitch extends ConsumerStatefulWidget {
  const _AnalyticsSwitch({required this.allowed});
  final bool allowed;

  @override
  ConsumerState<_AnalyticsSwitch> createState() => _AnalyticsSwitchState();
}

class _AnalyticsSwitchState extends ConsumerState<_AnalyticsSwitch> {
  late bool _on = widget.allowed;
  bool _busy = false;

  Future<void> _set(bool v) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _busy = true;
      _on = v;
    });
    try {
      await ref.read(authControllerProvider.notifier).setAnalyticsConsent(v);
      ref.invalidate(privacyStatusProvider);
    } catch (e) {
      if (mounted) setState(() => _on = !v);
      messenger.showSnackBar(SnackBar(content: Text(friendlyError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Tile(
      icon: Icons.insights_outlined,
      title: 'Help improve the app',
      subtitle:
          'Share which screens you use (Google Analytics for Firebase). Never your trades or identity.',
      trailing: Switch(value: _on, onChanged: _busy ? null : _set),
    );
  }
}

/// The access right: everything we hold, and who we shared it with, as JSON.
class _DownloadTile extends ConsumerStatefulWidget {
  const _DownloadTile();

  @override
  ConsumerState<_DownloadTile> createState() => _DownloadTileState();
}

class _DownloadTileState extends ConsumerState<_DownloadTile> {
  bool _busy = false;

  Future<void> _download() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final bytes = await ref.read(privacyRepositoryProvider).exportData();
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              bytes,
              name: 'stockvirtue-my-data.json',
              mimeType: 'application/json',
            ),
          ],
          subject: 'My StockVirtue data',
        ),
      );
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(friendlyError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Tile(
      icon: Icons.download_outlined,
      title: 'Download my data',
      subtitle: _busy
          ? 'Preparing your file…'
          : 'Everything we hold about you, and who we shared it with',
      onTap: _busy ? null : _download,
    );
  }
}

/// The nominee (DPDP Act 2023 s.14).
class _NomineeTile extends ConsumerWidget {
  const _NomineeTile({required this.nominee});
  final Nominee? nominee;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = nominee;
    return _Tile(
      icon: Icons.person_add_alt_outlined,
      title: n == null ? 'Nominate someone' : 'Nominee: ${n.name}',
      subtitle: n == null
          ? 'Who can act for you if you die or can’t act yourself'
          : [n.relationship, n.email, n.phone]
              .where((x) => x != null && x.isNotEmpty)
              .join(' · '),
      onTap: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _NomineeSheet(current: n),
      ),
    );
  }
}

class _NomineeSheet extends ConsumerStatefulWidget {
  const _NomineeSheet({required this.current});
  final Nominee? current;

  @override
  ConsumerState<_NomineeSheet> createState() => _NomineeSheetState();
}

class _NomineeSheetState extends ConsumerState<_NomineeSheet> {
  late final _name = TextEditingController(text: widget.current?.name);
  late final _email = TextEditingController(text: widget.current?.email);
  late final _phone = TextEditingController(text: widget.current?.phone);
  late final _relation =
      TextEditingController(text: widget.current?.relationship);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _relation.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() body, String done) async {
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await body();
      ref.invalidate(privacyStatusProvider);
      navigator.pop();
      messenger.showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = ref.read(privacyRepositoryProvider);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Your nominee',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          const Text(
            'If you die or can’t act yourself, this person can ask us to '
            'download, correct or delete your data. Add an email or a phone '
            'number so we can confirm it’s them.',
            style: TextStyle(fontSize: 12.5, height: 1.4),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            enabled: !_busy,
            decoration: const InputDecoration(labelText: 'Full name'),
          ),
          TextField(
            controller: _relation,
            enabled: !_busy,
            decoration: const InputDecoration(
              labelText: 'Relationship (optional)',
            ),
          ),
          TextField(
            controller: _email,
            enabled: !_busy,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          TextField(
            controller: _phone,
            enabled: !_busy,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Phone'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy
                ? null
                : () {
                    final name = _name.text.trim();
                    if (name.length < 2 ||
                        (_email.text.trim().isEmpty &&
                            _phone.text.trim().isEmpty)) {
                      setState(
                        () => _error =
                            'Add their name and an email or phone number.',
                      );
                      return;
                    }
                    _run(
                      () => repo.saveNominee(
                        Nominee(
                          name: name,
                          email: _email.text.trim(),
                          phone: _phone.text.trim(),
                          relationship: _relation.text.trim(),
                        ),
                      ),
                      'Nominee saved.',
                    );
                  },
            child: Text(_busy ? 'Saving…' : 'Save nominee'),
          ),
          if (widget.current != null)
            TextButton(
              onPressed:
                  _busy ? null : () => _run(repo.removeNominee, 'Nominee removed.'),
              child: const Text('Remove nominee'),
            ),
        ],
      ),
    );
  }
}

/// Requests and complaints the person raised, and a new one.
class _RequestsTile extends ConsumerWidget {
  const _RequestsTile({required this.open});
  final int open;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _Tile(
      icon: Icons.support_agent_outlined,
      title: 'Make a request or complaint',
      subtitle: open > 0
          ? '$open waiting for an answer'
          : 'Ask for a correction, withdraw consent, or complain',
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const _RequestsScreen()),
      ),
    );
  }
}

class _RequestsScreen extends ConsumerWidget {
  const _RequestsScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(privacyRequestsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Requests and complaints')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => const _NewRequestSheet(),
        ),
        icon: const Icon(Icons.add),
        label: const Text('New request'),
      ),
      body: list.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(friendlyError(e))),
        data: (items) => items.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Nothing here yet. Ask us anything about your data, or '
                    'make a complaint: a person answers by email.',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final r = items[i];
                  return Card(
                    margin: EdgeInsets.zero,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  kRequestTypes[r.type] ??
                                      (r.type == 'ERASURE'
                                          ? 'Delete my data'
                                          : r.type),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              Text(
                                kRequestStatuses[r.status] ?? r.status,
                                style: const TextStyle(fontSize: 12),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${r.reference} · sent ${_day(context, r.createdAt)}'
                            '${r.status == 'OPEN' || r.status == 'IN_PROGRESS' ? ' · answer by ${_day(context, r.dueAt)}' : ''}',
                            style: const TextStyle(fontSize: 12),
                          ),
                          if (r.response != null && r.response!.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(r.response!),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _NewRequestSheet extends ConsumerStatefulWidget {
  const _NewRequestSheet();

  @override
  ConsumerState<_NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends ConsumerState<_NewRequestSheet> {
  String _type = 'GRIEVANCE';
  final _details = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final details = _details.text.trim();
    if (details.length < 5) {
      setState(() => _error = 'Tell us a little more.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(privacyRepositoryProvider).raise(_type, details);
      ref
        ..invalidate(privacyRequestsProvider)
        ..invalidate(privacyStatusProvider);
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Sent. Your reference is ${r.reference}; we emailed you a copy.',
          ),
        ),
      );
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'New request',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'What is it about?'),
            items: [
              for (final e in kRequestTypes.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: _busy ? null : (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _details,
            enabled: !_busy,
            minLines: 3,
            maxLines: 6,
            maxLength: 4000,
            decoration: const InputDecoration(
              labelText: 'Details',
              hintText: 'What should we do, or what went wrong?',
            ),
          ),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _send,
            child: Text(_busy ? 'Sending…' : 'Send'),
          ),
        ],
      ),
    );
  }
}

/// Who answers privacy questions (DPDP Rules 2025, rule 9), and the Board.
class _ContactCard extends StatelessWidget {
  const _ContactCard({required this.info});
  final PrivacyInfo info;

  @override
  Widget build(BuildContext context) {
    final muted =
        Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Grievance officer',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                [
                  if (info.officerName != null && info.officerName!.isNotEmpty)
                    info.officerName!,
                  info.legalName,
                ].join(', '),
                style: TextStyle(color: muted),
              ),
              TextButton.icon(
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: () => launchUrl(Uri.parse('mailto:${info.officerEmail}')),
                icon: const Icon(Icons.mail_outline, size: 16),
                label: Text(info.officerEmail),
              ),
              if (info.officerPhone != null && info.officerPhone!.isNotEmpty)
                Text(info.officerPhone!, style: TextStyle(color: muted)),
              const SizedBox(height: 6),
              Text(
                'We answer within ${info.responseDays} days. If you are not '
                'satisfied, you can complain to the Data Protection Board of '
                'India.',
                style: TextStyle(fontSize: 12.5, color: muted, height: 1.4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
