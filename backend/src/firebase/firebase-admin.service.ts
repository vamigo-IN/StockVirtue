import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  App,
  ServiceAccount,
  cert,
  initializeApp,
} from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Messaging, getMessaging } from 'firebase-admin/messaging';
import { AppConfig } from '../config/configuration';

/**
 * Shared Firebase Admin SDK initializer. Both authentication (ID-token
 * verification) and FCM messaging route through the same `firebase-admin` App
 * instance, configured from the FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT env vars.
 *
 * If credentials are missing, the service stays unconfigured: FCM degrades to
 * console-only, and /auth/firebase/login rejects every request (login requires
 * this to be configured — there is no dev-OTP fallback anymore).
 */
@Injectable()
export class FirebaseAdminService {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private app: App | null = null;
  readonly configured: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const projectId = config.get('fcm.projectId', { infer: true });
    const serviceAccount = config.get('fcm.serviceAccount', { infer: true });
    if (!projectId || !serviceAccount) {
      this.configured = false;
      this.logger.warn(
        'Firebase Admin not configured (set FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT). Auth + FCM will use dev fallbacks.',
      );
      return;
    }
    try {
      const credentialJson = JSON.parse(serviceAccount) as Record<
        string,
        unknown
      >;
      this.app = initializeApp({
        credential: cert(credentialJson as ServiceAccount),
        projectId,
      });
      this.configured = true;
      this.logger.log(
        `Firebase Admin initialized for project "${projectId}"`,
      );
    } catch (err) {
      this.configured = false;
      this.logger.error(
        `Firebase Admin init failed: ${(err as Error).message}`,
      );
    }
  }

  auth(): Auth {
    if (!this.app) {
      throw new ServiceUnavailableException('Firebase Admin not configured');
    }
    return getAuth(this.app);
  }

  messaging(): Messaging {
    if (!this.app) {
      throw new ServiceUnavailableException('Firebase Admin not configured');
    }
    return getMessaging(this.app);
  }
}
