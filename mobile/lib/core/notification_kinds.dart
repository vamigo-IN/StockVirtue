/// Enum lifted out of the notifications feature so the core preferences
/// module can reference it without creating a feature ↔ core cycle.
library;

enum AppNotificationKind {
  orderPlaced,
  orderFilled,
  orderCancelled,
  orderRejected,
  priceAlert,
  positionAutoSquare,
  expirySettlement,
  info,
}
