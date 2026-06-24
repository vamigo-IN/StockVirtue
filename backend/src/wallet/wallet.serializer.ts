import { Wallet } from '@prisma/client';
import { paiseToRupees } from '../common/money';

export function serializeWallet(w: Wallet) {
  const available = w.balanceP - w.reservedP - w.marginReservedP;
  return {
    balance: paiseToRupees(w.balanceP),
    reserved: paiseToRupees(w.reservedP),
    marginReserved: paiseToRupees(w.marginReservedP),
    available: paiseToRupees(available),
    balanceInPaise: w.balanceP.toString(),
    reservedInPaise: w.reservedP.toString(),
    marginReservedInPaise: w.marginReservedP.toString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}
