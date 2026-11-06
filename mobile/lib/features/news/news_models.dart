/// Newsroom stories as the app reads them from /api/v1/news. Parsing is
/// lenient: a missing or unexpected field becomes null/empty rather than an
/// exception, so a newer backend never breaks an older app.
library;

String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
List<Map<String, dynamic>> _maps(Object? v) => v is List
    ? v.whereType<Map>().map((m) => m.cast<String, dynamic>()).toList()
    : const [];

/// A picture from the media library: the original plus smaller WebP copies.
class NewsImage {
  const NewsImage({
    required this.url,
    this.width,
    this.height,
    this.alt = '',
    this.credit,
    this.variants = const [],
  });

  final String url;
  final int? width;
  final int? height;
  final String alt;
  final String? credit;

  /// Smaller copies, narrowest first.
  final List<({String url, int width})> variants;

  double? get aspectRatio => width != null && height != null && height! > 0
      ? width! / height!
      : null;

  /// The smallest copy at least [pixels] wide, else the original.
  String urlFor(double pixels) {
    for (final v in variants) {
      if (v.width >= pixels) return v.url;
    }
    return url;
  }

  static NewsImage? fromJson(Object? json) {
    if (json is! Map) return null;
    final url = _str(json['url']);
    if (url == null) return null;
    return NewsImage(
      url: url,
      width: _int(json['width']),
      height: _int(json['height']),
      alt: _str(json['alt']) ?? '',
      credit: _str(json['credit']),
      variants: [
        for (final v in _maps(json['variants']))
          if (_str(v['url']) != null && _int(v['width']) != null)
            (url: v['url'] as String, width: _int(v['width'])!),
      ]..sort((a, b) => a.width.compareTo(b.width)),
    );
  }
}

class NewsCategoryRef {
  const NewsCategoryRef({required this.slug, required this.name});
  final String slug;
  final String name;

  static NewsCategoryRef? fromJson(Object? json) {
    if (json is! Map) return null;
    final slug = _str(json['slug']);
    final name = _str(json['name']);
    return slug == null || name == null
        ? null
        : NewsCategoryRef(slug: slug, name: name);
  }
}

class NewsAuthorRef {
  const NewsAuthorRef({
    required this.slug,
    required this.name,
    this.avatarUrl,
    this.bio,
  });
  final String slug;
  final String name;
  final String? avatarUrl;
  final String? bio;

  static NewsAuthorRef? fromJson(Object? json) {
    if (json is! Map) return null;
    final slug = _str(json['slug']);
    final name = _str(json['name']);
    if (slug == null || name == null) return null;
    return NewsAuthorRef(
      slug: slug,
      name: name,
      avatarUrl: _str(json['avatarUrl']),
      bio: _str(json['bio']),
    );
  }
}

/// A story in a list: headline, standfirst, picture and labels.
class NewsCard {
  const NewsCard({
    required this.id,
    required this.slug,
    required this.title,
    this.subtitle,
    this.summary = '',
    this.publishedAt,
    this.updatedAt,
    this.readingMinutes = 1,
    this.isBreaking = false,
    this.breakingAt,
    this.isFeatured = false,
    this.isAiGenerated = false,
    this.category,
    this.author,
    this.image,
  });

  final String id;
  final String slug;
  final String title;
  final String? subtitle;
  final String summary;
  final DateTime? publishedAt;
  final DateTime? updatedAt;
  final int readingMinutes;

  /// The server's flag: marked breaking and inside its 24 hours when sent.
  final bool isBreaking;

  /// When it became breaking (sent while it is); null from servers older
  /// than 6 Nov 2026.
  final DateTime? breakingAt;
  final bool isFeatured;

  /// How long a story stays breaking news (the server's rule).
  static const breakingFor = Duration(hours: 24);

  /// Breaking right now: what labels and the breaking strip show. A list
  /// left open past the end drops the label at its next rebuild. Without a
  /// time it counts from publication, as older servers did.
  bool get isBreakingNow {
    if (!isBreaking) return false;
    final since = breakingAt ?? publishedAt;
    return since == null || DateTime.now().difference(since) < breakingFor;
  }

  /// Uses AI-written text; readers are told so.
  final bool isAiGenerated;
  final NewsCategoryRef? category;
  final NewsAuthorRef? author;
  final NewsImage? image;

  static NewsCard? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    final slug = _str(json['slug']);
    final title = _str(json['title']);
    if (id == null || slug == null || title == null) return null;
    return NewsCard(
      id: id,
      slug: slug,
      title: title,
      subtitle: _str(json['subtitle']),
      summary: _str(json['summary']) ?? '',
      publishedAt: _date(json['publishedAt']),
      updatedAt: _date(json['updatedAt']),
      readingMinutes: _int(json['readingMinutes']) ?? 1,
      isBreaking: json['isBreaking'] == true,
      breakingAt: _date(json['breakingAt']),
      isFeatured: json['isFeatured'] == true,
      isAiGenerated: json['isAiGenerated'] == true,
      category: NewsCategoryRef.fromJson(json['category']),
      author: NewsAuthorRef.fromJson(json['author']),
      image: NewsImage.fromJson(json['image']),
    );
  }

  static List<NewsCard> listFrom(Object? json) => [
        for (final m in _maps(json)) ?NewsCard.fromJson(m),
      ];
}

/// One page of a listing.
class NewsPage {
  const NewsPage({
    required this.items,
    required this.page,
    required this.totalPages,
    required this.total,
  });

  final List<NewsCard> items;
  final int page;
  final int totalPages;
  final int total;

  bool get hasMore => page < totalPages;

  static NewsPage fromJson(Map<String, dynamic> json) => NewsPage(
        items: NewsCard.listFrom(json['items']),
        page: _int(json['page']) ?? 1,
        totalPages: _int(json['totalPages']) ?? 1,
        total: _int(json['total']) ?? 0,
      );
}

class NewsCategory {
  const NewsCategory({
    required this.slug,
    required this.name,
    this.children = const [],
    this.keepSeparate = false,
  });
  final String slug;
  final String name;
  final List<NewsCategory> children;

  /// Its stories stay out of the latest list (Official updates), so the
  /// News screen gives it a chip up front and a section of its own.
  final bool keepSeparate;

  /// The section kept separate before the API said which ones are.
  static const officialUpdatesSlug = 'official-updates';

  static NewsCategory? fromJson(Object? json) {
    if (json is! Map) return null;
    final slug = _str(json['slug']);
    final name = _str(json['name']);
    if (slug == null || name == null) return null;
    final separate = json['keepSeparate'];
    return NewsCategory(
      slug: slug,
      name: name,
      children: [
        for (final c in _maps(json['children'])) ?NewsCategory.fromJson(c),
      ],
      keepSeparate:
          separate is bool ? separate : slug == officialUpdatesSlug,
    );
  }
}

/// A listed company a story is about.
class NewsStockTag {
  const NewsStockTag({
    required this.exchange,
    required this.symbol,
    this.name,
  });
  final String exchange;
  final String symbol;
  final String? name;
}

class NewsSourceCredit {
  const NewsSourceCredit({required this.name, this.url, this.note});
  final String name;
  final String? url;
  final String? note;
}

/// The whole story, for the native reader.
class NewsArticle {
  const NewsArticle({
    required this.card,
    this.firstPublishedAt,
    this.imageCaption,
    this.tags = const [],
    this.stocks = const [],
    this.sources = const [],
    this.retractedAt,
    this.retractionNote,
    this.related = const [],
    this.doc,
    this.docVersion = 1,
  });

  final NewsCard card;
  final DateTime? firstPublishedAt;
  final String? imageCaption;
  final List<({String slug, String name})> tags;
  final List<NewsStockTag> stocks;
  final List<NewsSourceCredit> sources;
  // No correction note: they were retired on 6 Nov 2026, and a fixed story
  // shows only its "Updated" time (wasUpdated below). Older API builds may
  // still send `correctionNote`; it is ignored.
  final DateTime? retractedAt;
  final String? retractionNote;
  final List<NewsCard> related;

  /// The body as a ProseMirror document (null if the server couldn't build it).
  final Map<String, dynamic>? doc;
  final int docVersion;

  String get id => card.id;
  String get slug => card.slug;
  String get title => card.title;

  /// Updated noticeably after it first went out.
  bool get wasUpdated {
    final first = firstPublishedAt ?? card.publishedAt;
    final updated = card.updatedAt;
    if (first == null || updated == null) return false;
    return updated.difference(first) > const Duration(minutes: 10);
  }

  static NewsArticle fromJson(Map<String, dynamic> json) {
    final card = NewsCard.fromJson(json);
    if (card == null) throw const FormatException('Not an article');
    return NewsArticle(
      card: card,
      firstPublishedAt: _date(json['firstPublishedAt']),
      imageCaption: _str(json['imageCaption']),
      tags: [
        for (final t in _maps(json['tags']))
          if (_str(t['slug']) != null && _str(t['name']) != null)
            (slug: t['slug'] as String, name: t['name'] as String),
      ],
      stocks: [
        for (final s in _maps(json['stocks']))
          if (_str(s['symbol']) != null)
            NewsStockTag(
              exchange: _str(s['exchange']) ?? 'NSE',
              symbol: s['symbol'] as String,
              name: _str(s['name']),
            ),
      ],
      sources: [
        for (final s in _maps(json['sources']))
          if (_str(s['name']) != null)
            NewsSourceCredit(
              name: s['name'] as String,
              url: _str(s['url']),
              note: _str(s['note']),
            ),
      ],
      retractedAt: _date(json['retractedAt']),
      retractionNote: _str(json['retractionNote']),
      related: NewsCard.listFrom(json['related']),
      doc: json['doc'] is Map
          ? (json['doc'] as Map).cast<String, dynamic>()
          : null,
      docVersion: _int(json['docVersion']) ?? 1,
    );
  }
}

/// The reader's news push settings.
class NewsAlerts {
  const NewsAlerts({
    required this.breaking,
    required this.followedStocks,
    this.followedCount = 0,
  });
  final bool breaking;
  final bool followedStocks;

  /// Companies followed through watchlists and holdings.
  final int followedCount;

  static NewsAlerts fromJson(Map<String, dynamic> json) => NewsAlerts(
        breaking: json['breaking'] != false,
        followedStocks: json['followedStocks'] != false,
        followedCount: _int(json['followedCount']) ?? 0,
      );
}
