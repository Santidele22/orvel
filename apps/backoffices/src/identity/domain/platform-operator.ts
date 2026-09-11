/**
 * Orvel staff operator, not a salon account.
 * `role` lives in Auth `app_metadata`, never `user_metadata`.
 */
export type PlatformOperator = {
  readonly id: string;
  readonly role: string;
};
