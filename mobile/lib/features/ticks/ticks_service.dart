import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../data/models/tick.dart';

class TickSubscription {
  final String symbol;
  final String exchange;
  const TickSubscription({required this.symbol, required this.exchange});

  Map<String, String> toJson() => {'symbol': symbol, 'exchange': exchange};
}

/// Returns a currently-valid access token (refreshing it first if needed).
/// Null when the user can no longer be authenticated.
typedef AccessTokenProvider = Future<String?> Function();

class TicksService {
  io.Socket? _socket;
  final _ticks = StreamController<Tick>.broadcast();
  final _connectionState = StreamController<bool>.broadcast();
  // Server-pushed notifications (order fills, alerts, reminders, admin
  // broadcasts) delivered over the same authenticated socket.
  final _notifications =
      StreamController<Map<String, dynamic>>.broadcast();
  AccessTokenProvider? _tokenProvider;
  bool _refreshingAuth = false;

  // Client-side refcount of every desired subscription, keyed by
  // "exchange:symbol". Two jobs:
  //   1. Overlapping screens share a subscription — one screen unsubscribing
  //      on dispose must NOT kill a symbol another screen still wants.
  //   2. The server forgets a socket's subscriptions the moment it drops, so
  //      after an auto-reconnect we replay this set (see _resubscribeAll).
  // Without this, live prices freeze a while after launch (the first network
  // blip silently strands every subscription).
  final Map<String, int> _refs = {};
  final Map<String, TickSubscription> _subByKey = {};

  Stream<Tick> get ticks => _ticks.stream;
  Stream<bool> get connectionState => _connectionState.stream;
  Stream<Map<String, dynamic>> get notifications => _notifications.stream;
  bool get isConnected => _socket?.connected ?? false;

  String _keyOf(TickSubscription s) => '${s.exchange}:${s.symbol}';

  void connect(
    String apiBaseUrl,
    String accessToken, {
    AccessTokenProvider? tokenProvider,
  }) {
    if (_socket?.connected ?? false) return;
    _tokenProvider = tokenProvider;
    final origin = apiBaseUrl.replaceFirst(RegExp(r'/api/?$'), '');

    _socket = io.io(
      origin,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .build(),
    );

    _socket!
      ..on('connect', (_) {
        _connectionState.add(true);
        // Replay every desired subscription. Fires on the first connect AND
        // on every silent auto-reconnect — the server starts each socket with
        // an empty subscription set, so without this the feed goes quiet after
        // the first dropped connection.
        _resubscribeAll();
      })
      ..on('disconnect', (reason) {
        _connectionState.add(false);
      })
      ..on('connect_error', (err) {
        if (kDebugMode) debugPrint('[TicksService] connect_error $err');
        // A reconnect typically fails because the access token expired while
        // the socket sat idle. Refresh it and update the handshake so the
        // next auto-retry (reconnection is enabled) authenticates cleanly.
        _refreshAuthToken();
      })
      ..on('tick', (data) {
        if (data is Map) {
          try {
            _ticks.add(Tick.fromJson(Map<String, dynamic>.from(data)));
          } catch (e) {
            if (kDebugMode) debugPrint('[TicksService] bad tick: $e');
          }
        }
      })
      ..on('notification', (data) {
        if (data is Map) {
          _notifications.add(Map<String, dynamic>.from(data));
        }
      })
      ..connect();
  }

  void subscribe(List<TickSubscription> symbols) {
    if (symbols.isEmpty) return;
    // Only the symbols crossing 0 -> 1 are new to the server.
    final fresh = <TickSubscription>[];
    for (final s in symbols) {
      final k = _keyOf(s);
      final n = (_refs[k] ?? 0) + 1;
      _refs[k] = n;
      if (n == 1) {
        _subByKey[k] = s;
        fresh.add(s);
      }
    }
    if (fresh.isEmpty) return;
    _socket?.emitWithAck(
      'subscribe',
      {'symbols': fresh.map((s) => s.toJson()).toList()},
      ack: (_) {},
    );
  }

  void unsubscribe(List<TickSubscription> symbols) {
    if (symbols.isEmpty) return;
    // Only the symbols dropping to 0 (no screen still wants them) leave.
    final gone = <TickSubscription>[];
    for (final s in symbols) {
      final k = _keyOf(s);
      final n = (_refs[k] ?? 0) - 1;
      if (n <= 0) {
        _refs.remove(k);
        final removed = _subByKey.remove(k);
        if (removed != null) gone.add(removed);
      } else {
        _refs[k] = n;
      }
    }
    if (gone.isEmpty) return;
    _socket?.emitWithAck(
      'unsubscribe',
      {'symbols': gone.map((s) => s.toJson()).toList()},
      ack: (_) {},
    );
  }

  void _resubscribeAll() {
    if (_subByKey.isEmpty) return;
    _socket?.emitWithAck(
      'subscribe',
      {'symbols': _subByKey.values.map((s) => s.toJson()).toList()},
      ack: (_) {},
    );
  }

  Future<void> _refreshAuthToken() async {
    final provider = _tokenProvider;
    if (provider == null || _refreshingAuth) return;
    _refreshingAuth = true;
    try {
      final token = await provider();
      if (token != null) {
        // Update the handshake payload in place; the socket.io client reads
        // `auth` afresh on each (re)connection attempt.
        _socket?.auth = {'token': token};
      }
    } catch (_) {
      // Best-effort — keep retrying with the existing token meanwhile.
    } finally {
      _refreshingAuth = false;
    }
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    // Explicit teardown (logout) — drop the desired set so a later login
    // doesn't replay a previous user's subscriptions. Transient auto-reconnects
    // never reach here, so they correctly keep + replay the set.
    _refs.clear();
    _subByKey.clear();
    _connectionState.add(false);
  }

  void dispose() {
    disconnect();
    _ticks.close();
    _connectionState.close();
    _notifications.close();
  }
}
