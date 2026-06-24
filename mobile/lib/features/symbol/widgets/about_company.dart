import 'package:flutter/material.dart';

import '../../../core/company_info.dart';

/// "About company" card. Renders nothing for symbols we don't have curated
/// info on, so generic equities don't show a placeholder.
class AboutCompany extends StatefulWidget {
  const AboutCompany({super.key, required this.symbol});
  final String symbol;

  @override
  State<AboutCompany> createState() => _AboutCompanyState();
}

class _AboutCompanyState extends State<AboutCompany> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final info = companyInfoFor(widget.symbol);
    if (info == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final aboutFull = info.about;
    final about = _expanded || aboutFull.length < 110
        ? aboutFull
        : '${aboutFull.substring(0, 110).trimRight()}…';
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.business_outlined,
                  color: scheme.primary,
                  size: 16,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'About the company',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            about,
            style: TextStyle(
              fontSize: 13,
              height: 1.45,
              color: scheme.onSurface.withValues(alpha: 0.78),
            ),
          ),
          if (aboutFull.length >= 110)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: InkWell(
                onTap: () => setState(() => _expanded = !_expanded),
                child: Text(
                  _expanded ? 'Show less' : 'Read more',
                  style: TextStyle(
                    color: scheme.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          const SizedBox(height: 14),
          Container(
            height: 1,
            color: scheme.outlineVariant.withValues(alpha: 0.2),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MetaChip(label: info.sector, icon: Icons.category_outlined),
              _MetaChip(label: info.industry, icon: Icons.factory_outlined),
              _MetaChip(label: info.hq, icon: Icons.place_outlined),
              _MetaChip(
                label: 'Est. ${info.founded}',
                icon: Icons.event_outlined,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 12,
            color: scheme.onSurface.withValues(alpha: 0.6),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface.withValues(alpha: 0.78),
            ),
          ),
        ],
      ),
    );
  }
}
