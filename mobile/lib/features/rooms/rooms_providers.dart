import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/room.dart';
import 'rooms_repository.dart';

/// Rooms the caller is a member of. Auto-refreshes when invalidated
/// (after create / join / leave) so the My-rooms tab updates instantly.
final myRoomsProvider = FutureProvider<List<RoomSummary>>((ref) {
  return ref.watch(roomsRepositoryProvider).listMine();
});

/// `null` → both tournament + evergreen public rooms.
/// `true` → only live tournaments.
/// `false` → only evergreen public rooms.
final publicRoomsProvider =
    FutureProvider.family<List<RoomSummary>, bool?>((ref, tournament) {
  return ref
      .watch(roomsRepositoryProvider)
      .listPublic(tournament: tournament);
});

/// Full room detail (header + member leaderboard). Family-keyed by id so
/// each open detail screen has its own provider state.
final roomDetailProvider =
    FutureProvider.family<RoomDetail, String>((ref, roomId) {
  return ref.watch(roomsRepositoryProvider).getDetail(roomId);
});
