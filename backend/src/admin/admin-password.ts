/// Admin password hashing. Thin alias over the shared scrypt implementation
/// in common/password.ts so admin auth and user email/password auth share a
/// single hashing scheme.
import { hashPassword, verifyPassword } from '../common/password';

export const hashAdminPassword = hashPassword;
export const verifyAdminPassword = verifyPassword;
