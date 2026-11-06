import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_models.dart';
import '../widgets/news_tiles.dart';
import 'story_links.dart';
import 'story_widgets.dart';

/// Draws a story's body — the ProseMirror document the newsroom stores —
/// with Flutter widgets: text and its formatting (bold, italic, underline,
/// strike, code, links, palette text colours and highlights, and paragraph
/// and heading alignment), headings, lists, quotes,
/// callouts, tables, pictures, videos, related stories and market widgets.
/// Node types this app doesn't know yet show a "View on stockvirtue.com"
/// card; unknown text formatting is ignored. The document has already been
/// checked against the newsroom's allowlist on the server.
class StoryDocView extends StatelessWidget {
  const StoryDocView({super.key, required this.doc, required this.articleUrl});

  final Map<String, dynamic> doc;
  final String articleUrl;

  @override
  Widget build(BuildContext context) {
    final blocks = _children(doc);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final node in blocks) _Block(node: node, articleUrl: articleUrl),
      ],
    );
  }
}

List<Map<String, dynamic>> _children(Map<String, dynamic> node) {
  final c = node['content'];
  return c is List
      ? c.whereType<Map>().map((m) => m.cast<String, dynamic>()).toList()
      : const [];
}

Map<String, dynamic> _attrs(Map<String, dynamic> node) => node['attrs'] is Map
    ? (node['attrs'] as Map).cast<String, dynamic>()
    : const {};

String _text(Map<String, dynamic> a, String k) =>
    a[k] is String ? a[k] as String : '';

/// Spacing below each block, so the body reads like an article.
const _gap = 14.0;

/// Text colours and highlights are stored as palette names (the newsroom
/// editor's list: web components/editor/formatting.ts, checked by the API's
/// article-content.ts; the website maps the same names in
/// article-prose.css). Each name has a light-theme and a dark-theme shade:
/// every text shade is at least 4.6:1 on the reader's backgrounds (page,
/// cards, callouts, table heads) and at least 4.5:1 on every highlight, and
/// the default text is at least 9:1 on every highlight. A name this version
/// doesn't know leaves the text as it is.
const _textColors = <String, (Color light, Color dark)>{
  'gray': (Color(0xFF55615B), Color(0xFFA7B3AD)),
  'green': (Color(0xFF0A6B41), Color(0xFF34E089)),
  'red': (Color(0xFFB42318), Color(0xFFFF8F87)),
  'orange': (Color(0xFFA84A0E), Color(0xFFFDA868)),
  'blue': (Color(0xFF1D57C7), Color(0xFF82B6FF)),
  'purple': (Color(0xFF6D3FD6), Color(0xFFBFA7FF)),
  'pink': (Color(0xFFB3166B), Color(0xFFF795C8)),
};
const _highlights = <String, (Color light, Color dark)>{
  'yellow': (Color(0xFFFFF0A3), Color(0xFF4A3E0C)),
  'green': (Color(0xFFCFF2DC), Color(0xFF16472E)),
  'blue': (Color(0xFFDCE8FF), Color(0xFF1D3A63)),
  'red': (Color(0xFFFFDCD8), Color(0xFF5A2424)),
  'purple': (Color(0xFFECDFFF), Color(0xFF40306A)),
};

/// A mark's palette colour for the current theme, or null for an unknown name.
Color? _paletteColor(
  Map<String, (Color, Color)> palette,
  Map mark,
  bool dark,
) {
  final attrs = mark['attrs'];
  final name = attrs is Map ? attrs['color'] : null;
  final shades = name is String ? palette[name] : null;
  if (shades == null) return null;
  return dark ? shades.$2 : shades.$1;
}

/// A paragraph's or heading's stored alignment (left is stored as nothing).
TextAlign _textAlign(Map<String, dynamic> a) => switch (a['textAlign']) {
      'center' => TextAlign.center,
      'right' => TextAlign.right,
      'justify' => TextAlign.justify,
      _ => TextAlign.start,
    };

TextStyle _bodyStyle(BuildContext context) =>
    (Theme.of(context).textTheme.bodyLarge ?? const TextStyle()).copyWith(
      fontSize: 16.5,
      height: 1.62,
    );

class _Block extends StatelessWidget {
  const _Block({
    required this.node,
    required this.articleUrl,
    this.nested = false,
    this.tweak,
  });
  final Map<String, dynamic> node;
  final String articleUrl;

  /// Inside a list, quote, callout or table cell: tighter spacing.
  final bool nested;

  /// Styling inherited from the container (italic quotes, bold headers).
  final TextStyle? tweak;

  Widget _child(Map<String, dynamic> c, [TextStyle? extra]) => _Block(
        node: c,
        articleUrl: articleUrl,
        nested: true,
        tweak: extra == null ? tweak : (tweak ?? const TextStyle()).merge(extra),
      );

  @override
  Widget build(BuildContext context) {
    final a = _attrs(node);
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final gap = nested ? 6.0 : _gap;
    Widget pad(Widget w, [double? bottom]) =>
        Padding(padding: EdgeInsets.only(bottom: bottom ?? gap), child: w);
    switch (node['type']) {
      case 'paragraph':
        final kids = _children(node);
        if (kids.isEmpty) return const SizedBox(height: 8);
        return pad(
          _RichText(
            inline: kids,
            style: _bodyStyle(context).merge(tweak),
            align: _textAlign(a),
          ),
        );
      case 'heading':
        final level = (a['level'] is num) ? (a['level'] as num).toInt() : 2;
        final style = (level == 2
                ? t.titleLarge
                : level == 3
                    ? t.titleMedium
                    : t.titleSmall)
            ?.copyWith(fontWeight: FontWeight.w800, height: 1.3);
        return Padding(
          padding: EdgeInsets.only(top: nested ? 4 : 8, bottom: 8),
          child: Semantics(
            header: true,
            child: _RichText(
              inline: _children(node),
              style: (style ?? const TextStyle()).merge(tweak),
              align: _textAlign(a),
            ),
          ),
        );
      case 'bulletList':
      case 'orderedList':
        final ordered = node['type'] == 'orderedList';
        final start = a['start'] is num ? (a['start'] as num).toInt() : 1;
        final items = _children(node);
        return pad(Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < items.length; i++)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: ordered ? 28 : 20,
                    child: Text(
                      ordered ? '${start + i}.' : '•',
                      style: _bodyStyle(context).copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final c in _children(items[i])) _child(c),
                      ],
                    ),
                  ),
                ],
              ),
          ],
        ));
      case 'blockquote':
        return pad(Container(
          padding: const EdgeInsets.fromLTRB(14, 4, 4, 4),
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: scheme.primary, width: 3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final c in _children(node))
                _child(c, const TextStyle(fontStyle: FontStyle.italic)),
            ],
          ),
        ));
      case 'callout':
        final m = context.market;
        final (color, icon) = switch (_text(a, 'tone')) {
          'warning' => (m.warning, Icons.warning_amber_rounded),
          'takeaway' => (m.up, Icons.lightbulb_outline_rounded),
          'note' => (scheme.onSurfaceVariant, Icons.sticky_note_2_outlined),
          _ => (m.info, Icons.info_outline_rounded),
        };
        return pad(Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(AppRadius.sm),
            border: Border.all(color: color.withValues(alpha: 0.25)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Icon(icon, size: 18, color: color),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [for (final c in _children(node)) _child(c)],
                ),
              ),
            ],
          ),
        ));
      case 'horizontalRule':
        return pad(const Divider(height: 24));
      case 'image':
        final image = NewsImage.fromJson(a['src']);
        if (image == null) return const SizedBox.shrink();
        final caption = _text(a, 'caption');
        final credit = _text(a, 'credit');
        return pad(Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            NewsPicture(
              image: NewsImage(
                url: image.url,
                width: image.width,
                height: image.height,
                alt: _text(a, 'alt'),
                variants: image.variants,
              ),
              aspectRatio: image.aspectRatio ?? 16 / 9,
            ),
            if (caption.isNotEmpty || credit.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  [caption, credit].where((s) => s.isNotEmpty).join(' · '),
                  style: t.bodySmall?.copyWith(height: 1.4),
                ),
              ),
          ],
        ));
      case 'video':
        return pad(_Video(
          url: _text(a, 'url'),
          thumbnail: _text(a, 'thumbnail'),
          caption: _text(a, 'caption'),
          provider: _text(a, 'provider'),
        ));
      case 'relatedArticle':
        final slug = _text(a, 'slug');
        final title = _text(a, 'title');
        if (slug.isEmpty || title.isEmpty) return const SizedBox.shrink();
        return pad(AppCard(
          radius: AppRadius.sm,
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          onTap: () => openStoryLink(context, '/news/$slug'),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'RELATED',
                      style: t.labelSmall?.copyWith(
                        color: context.market.info,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ));
      case 'table':
        return pad(_StoryTable(node: node, articleUrl: articleUrl));
      case 'marketWidget':
        return pad(StoryWidget(
          type: _text(a, 'widget'),
          version: a['v'] is num ? (a['v'] as num).toInt() : 1,
          config: a['config'] is Map
              ? (a['config'] as Map).cast<String, dynamic>()
              : const {},
          data: a['data'] is Map
              ? (a['data'] as Map).cast<String, dynamic>()
              : null,
          articleUrl: articleUrl,
        ));
      default:
        // A block type added after this version of the app.
        return pad(StoryFallbackCard(url: articleUrl));
    }
  }
}

/// A run of text with its formatting; links open in the reader or browser.
class _RichText extends StatefulWidget {
  const _RichText({
    required this.inline,
    required this.style,
    this.align = TextAlign.start,
  });
  final List<Map<String, dynamic>> inline;
  final TextStyle style;
  final TextAlign align;

  @override
  State<_RichText> createState() => _RichTextState();
}

class _RichTextState extends State<_RichText> {
  final _recognizers = <TapGestureRecognizer>[];

  void _clear() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _clear();
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final spans = <InlineSpan>[];
    for (final node in widget.inline) {
      if (node['type'] == 'hardBreak') {
        spans.add(const TextSpan(text: '\n'));
        continue;
      }
      final text = node['text'];
      if (text is! String || text.isEmpty) continue;
      var style = const TextStyle();
      String? href;
      final marks = node['marks'];
      for (final m in marks is List ? marks.whereType<Map>() : const <Map>[]) {
        switch (m['type']) {
          case 'bold':
            style = style.copyWith(fontWeight: FontWeight.w700);
          case 'italic':
            style = style.copyWith(fontStyle: FontStyle.italic);
          case 'underline':
            style = style.copyWith(
              decoration: TextDecoration.combine([
                ?style.decoration,
                TextDecoration.underline,
              ]),
            );
          case 'strike':
            style = style.copyWith(
              decoration: TextDecoration.combine([
                ?style.decoration,
                TextDecoration.lineThrough,
              ]),
            );
          case 'code':
            style = style.copyWith(
              fontFamily: 'monospace',
              fontSize: (widget.style.fontSize ?? 16) * 0.9,
              backgroundColor: scheme.surfaceContainerHighest,
            );
          case 'link':
            final h = (m['attrs'] is Map) ? (m['attrs'] as Map)['href'] : null;
            if (h is String && h.isNotEmpty) href = h;
          case 'textColor':
            final c = _paletteColor(_textColors, m, dark);
            if (c != null) style = style.copyWith(color: c);
          case 'highlight':
            final c = _paletteColor(_highlights, m, dark);
            if (c != null) style = style.copyWith(backgroundColor: c);
        }
      }
      if (href != null) {
        final target = href;
        final r = TapGestureRecognizer()
          ..onTap = () => openStoryLink(context, target);
        _recognizers.add(r);
        // A coloured link keeps the writer's colour (as on the website);
        // the underline still marks it as a link.
        style = style.copyWith(
          color: style.color ?? scheme.primary,
          decoration: TextDecoration.underline,
          decorationColor: scheme.primary.withValues(alpha: 0.5),
        );
        spans.add(TextSpan(text: text, style: style, recognizer: r));
      } else {
        spans.add(TextSpan(text: text, style: style));
      }
    }
    return Text.rich(
      TextSpan(style: widget.style, children: spans),
      textAlign: widget.align,
    );
  }
}

class _Video extends StatelessWidget {
  const _Video({
    required this.url,
    required this.thumbnail,
    required this.caption,
    required this.provider,
  });
  final String url;
  final String thumbnail;
  final String caption;
  final String provider;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    if (url.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: Material(
              color: const Color(0xFF0B1220),
              child: InkWell(
                onTap: () => openStoryLink(context, url),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (thumbnail.isNotEmpty)
                      Image.network(
                        thumbnail,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: const BoxDecoration(
                          color: Color(0xCC000000),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.play_arrow_rounded,
                          color: Colors.white,
                          size: 34,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 10,
                      bottom: 8,
                      child: Text(
                        provider == 'vimeo' ? 'Watch on Vimeo' : 'Watch on YouTube',
                        style: t.labelSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          shadows: const [Shadow(blurRadius: 4)],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (caption.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              caption,
              style: t.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
      ],
    );
  }
}

/// Tables fill the width when their columns fit, and scroll sideways rather
/// than squeeze them when they don't.
class _StoryTable extends StatelessWidget {
  const _StoryTable({required this.node, required this.articleUrl});
  final Map<String, dynamic> node;
  final String articleUrl;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final border = context.market.cardBorder;
    final rows = _children(node);
    int span(Map<String, dynamic> cell) => (_attrs(cell)['colspan'] is num)
        ? (_attrs(cell)['colspan'] as num).toInt().clamp(1, 6)
        : 1;
    final columns = rows.fold<int>(
      1,
      (most, r) => math.max(
        most,
        _children(r).fold<int>(0, (n, c) => n + span(c)),
      ),
    );
    return LayoutBuilder(
      builder: (context, box) {
        // 2 px for the table's own border.
        final column = math.max(110.0, (box.maxWidth - 2) / columns);
        return _scroller(rows, column, span, scheme, border);
      },
    );
  }

  Widget _scroller(
    List<Map<String, dynamic>> rows,
    double column,
    int Function(Map<String, dynamic>) span,
    ColorScheme scheme,
    Color border,
  ) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(AppRadius.xs),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var r = 0; r < rows.length; r++)
              Container(
                decoration: BoxDecoration(
                  border: r == rows.length - 1
                      ? null
                      : Border(bottom: BorderSide(color: border)),
                ),
                child: IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final cell in _children(rows[r]))
                        Container(
                          width: column * span(cell),
                          padding: const EdgeInsets.fromLTRB(10, 8, 10, 2),
                          color: cell['type'] == 'tableHeader'
                              ? scheme.surfaceContainerHighest
                              : null,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final c in _children(cell))
                                _Block(
                                  node: c,
                                  articleUrl: articleUrl,
                                  nested: true,
                                  tweak: cell['type'] == 'tableHeader'
                                      ? const TextStyle(fontWeight: FontWeight.w700)
                                      : null,
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
