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

class TicksService {
  io.Socket? _socket;
  final _ticks = StreamController<Tick>.broadcast();
  final _connectionState = StreamController<bool>.broadcast();

  Stream<Tick> get ticks => _ticks.stream;
  Stream<bool> get connectionState => _connectionState.stream;
  bool get isConnected => _socket?.connected ?? false;

  void connect(String apiBaseUrl, String accessToken) {
    if (_socket?.connected ?? false) return;
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
      })
      ..on('disconnect', (reason) {
        _connectionState.add(false);
      })
      ..on('connect_error', (err) {
        if (kDebugMode) debugPrint('[TicksService] connect_error $err');
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
      ..connect();
  }

  void subscribe(List<TickSubscription> symbols) {
    if (symbols.isEmpty) return;
    _socket?.emitWithAck(
      'subscribe',
      {'symbols': symbols.map((s) => s.toJson()).toList()},
      ack: (_) {},
    );
  }

  void unsubscribe(List<TickSubscription> symbols) {
    if (symbols.isEmpty) return;
    _socket?.emitWithAck(
      'unsubscribe',
      {'symbols': symbols.map((s) => s.toJson()).toList()},
      ack: (_) {},
    );
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connectionState.add(false);
  }

  void dispose() {
    disconnect();
    _ticks.close();
    _connectionState.close();
  }
}
