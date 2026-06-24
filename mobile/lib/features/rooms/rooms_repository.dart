import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/room.dart';

class CreateRoomInput {
  final String name;
  final String? description;
  final bool isPublic;
  final bool isTournament;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int maxMembers;

  const CreateRoomInput({
    required this.name,
    this.description,
    required this.isPublic,
    required this.isTournament,
    this.startsAt,
    this.endsAt,
    this.maxMembers = 0,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        if (description != null) 'description': description,
        'isPublic': isPublic,
        'isTournament': isTournament,
        if (startsAt != null) 'startsAt': startsAt!.toIso8601String(),
        if (endsAt != null) 'endsAt': endsAt!.toIso8601String(),
        'maxMembers': maxMembers,
      };
}

class RoomsRepository {
  RoomsRepository(this._dio);
  final Dio _dio;

  Future<RoomSummary> create(CreateRoomInput input) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/rooms',
      data: input.toJson(),
    );
    return RoomSummary.fromJson(res.data!);
  }

  Future<RoomSummary> joinByCode(String code) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/rooms/join',
      data: {'code': code},
    );
    return RoomSummary.fromJson(res.data!);
  }

  Future<RoomSummary> joinPublic(String roomId) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/rooms/$roomId/join');
    return RoomSummary.fromJson(res.data!);
  }

  Future<void> leave(String roomId) async {
    await _dio.delete<Map<String, dynamic>>('/rooms/$roomId/leave');
  }

  Future<void> close(String roomId) async {
    await _dio.delete<Map<String, dynamic>>('/rooms/$roomId');
  }

  Future<List<RoomSummary>> listMine() async {
    final res = await _dio.get<Map<String, dynamic>>('/rooms/mine');
    final rooms = (res.data!['rooms'] as List).cast<Map<String, dynamic>>();
    return rooms.map(RoomSummary.fromJson).toList();
  }

  /// `tournament` filters the public list. `null` returns both
  /// tournament + evergreen rooms; `true` only live tournaments;
  /// `false` only evergreen rooms.
  Future<List<RoomSummary>> listPublic({
    bool? tournament,
    String? search,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/rooms/public',
      queryParameters: {
        if (tournament != null) 'tournament': tournament.toString(),
        if (search != null && search.isNotEmpty) 'q': search,
      },
    );
    final rooms = (res.data!['rooms'] as List).cast<Map<String, dynamic>>();
    return rooms.map(RoomSummary.fromJson).toList();
  }

  Future<RoomDetail> getDetail(String roomId) async {
    final res = await _dio.get<Map<String, dynamic>>('/rooms/$roomId');
    return RoomDetail.fromJson(res.data!);
  }
}

final roomsRepositoryProvider = Provider<RoomsRepository>((ref) {
  return RoomsRepository(ref.watch(apiClientProvider).dio);
});
