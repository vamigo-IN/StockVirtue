import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/order.dart';
import 'orders_repository.dart';

final ordersListProvider = FutureProvider<List<OrderRecord>>((ref) {
  return ref.watch(ordersRepositoryProvider).list();
});
