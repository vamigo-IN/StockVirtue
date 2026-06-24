import 'package:flutter/material.dart';

/// Compile-time fallback. The real implementation is selected by the
/// conditional export in `chart_view.dart` based on the target platform.
class ChartView extends StatelessWidget {
  const ChartView({super.key, required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text('Chart not supported on this platform'),
    );
  }
}
