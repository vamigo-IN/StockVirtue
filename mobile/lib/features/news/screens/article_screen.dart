import 'package:flutter/material.dart';

import '../../chart/chart_view.dart';

/// In-app reader for a news article. Loads the source URL in a WebView —
/// same cross-platform shim we use for the TradingView page.
class ArticleScreen extends StatelessWidget {
  const ArticleScreen({super.key, required this.title, required this.url});
  final String title;
  final String url;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      body: ChartView(url: url),
    );
  }
}
