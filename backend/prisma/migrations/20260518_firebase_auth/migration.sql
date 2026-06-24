-- Make phone nullable for Google-first sign-ins.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

-- Track the Firebase Auth UID so we can re-link returning users even when
-- claims arrive without phone or email.
ALTER TABLE "users" ADD COLUMN "firebaseUid" TEXT;
CREATE UNIQUE INDEX "users_firebaseUid_key" ON "users"("firebaseUid");
