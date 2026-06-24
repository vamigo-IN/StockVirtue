// Cross-platform ChartView. Picks the right implementation at compile time
// so neither webview_flutter (mobile) nor dart:ui_web (web) leak into the
// other bundle.
export 'chart_view_stub.dart'
    if (dart.library.io) 'chart_view_native.dart'
    if (dart.library.html) 'chart_view_web.dart';
