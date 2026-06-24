import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

class ChartView extends StatefulWidget {
  const ChartView({super.key, required this.url});
  final String url;

  @override
  State<ChartView> createState() => _ChartViewState();
}

class _ChartViewState extends State<ChartView> {
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _viewType = 'stockvirtue-tv-${identityHashCode(this)}';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int _) {
      final iframe = web.HTMLIFrameElement()
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..src = widget.url;
      // Allow TradingView scripts and popups inside the iframe.
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms',
      );
      return iframe;
    });
  }

  @override
  Widget build(BuildContext context) {
    return HtmlElementView(viewType: _viewType);
  }
}
