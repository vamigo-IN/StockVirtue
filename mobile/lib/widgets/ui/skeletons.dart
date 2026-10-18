import 'package:flutter/material.dart';
import 'package:skeletonizer/skeletonizer.dart';

import '../../core/design/tokens.dart';

/// Shimmering placeholder rows shown while a list loads — the shape of the
/// real content instead of a lone spinner, so the screen doesn't jump when
/// data lands.
class SkeletonList extends StatelessWidget {
  const SkeletonList({
    super.key,
    this.rows = 8,
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 24),
    this.showHeader = false,
  });

  final int rows;
  final EdgeInsets padding;
  final bool showHeader;

  @override
  Widget build(BuildContext context) {
    return Skeletonizer(
      effect: ShimmerEffect(
        baseColor: Theme.of(context).colorScheme.surfaceContainerHigh,
        highlightColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
      child: ListView(
        padding: padding,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          if (showHeader) ...[
            const Bone(height: 120, borderRadius: BorderRadius.all(Radius.circular(AppRadius.lg))),
            const SizedBox(height: 16),
          ],
          for (var i = 0; i < rows; i++) const _SkeletonRow(),
        ],
      ),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Bone.circle(size: 40),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Bone.text(words: 3),
                SizedBox(height: 6),
                Bone.text(words: 2, fontSize: 11),
              ],
            ),
          ),
          SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Bone.text(words: 1),
              SizedBox(height: 6),
              Bone(width: 54, height: 16),
            ],
          ),
        ],
      ),
    );
  }
}

/// Horizontal strip of placeholder cards (index tiles, IPO cards).
class SkeletonCards extends StatelessWidget {
  const SkeletonCards({super.key, this.height = 120, this.width = 160});

  final double height;
  final double width;

  @override
  Widget build(BuildContext context) {
    return Skeletonizer(
      effect: ShimmerEffect(
        baseColor: Theme.of(context).colorScheme.surfaceContainerHigh,
        highlightColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
      child: SizedBox(
        height: height,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          physics: const NeverScrollableScrollPhysics(),
          itemCount: 4,
          separatorBuilder: (_, _) => const SizedBox(width: 12),
          itemBuilder: (_, _) => Bone(
            width: width,
            height: height,
            borderRadius: const BorderRadius.all(Radius.circular(AppRadius.lg)),
          ),
        ),
      ),
    );
  }
}
