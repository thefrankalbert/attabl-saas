/**
 * Skeleton for the auth form (OAuth button + divider + email/password fields +
 * submit). Shown as the Suspense fallback on login/signup so the form shape is
 * visible while AuthForm loads, instead of a spinner. Theme-neutral blocks
 * (works on the light and dark auth themes).
 */
export function AuthFormSkeleton() {
  const block = 'rounded-md bg-black/[0.07] dark:bg-white/[0.09]';
  return (
    <div className="w-full animate-pulse space-y-5">
      {/* OAuth button */}
      <div className={`h-11 w-full ${block}`} />
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className={`h-px flex-1 ${block}`} />
        <div className={`h-3 w-8 ${block}`} />
        <div className={`h-px flex-1 ${block}`} />
      </div>
      {/* Email field */}
      <div className="space-y-2">
        <div className={`h-3 w-16 ${block}`} />
        <div className={`h-11 w-full ${block}`} />
      </div>
      {/* Password field */}
      <div className="space-y-2">
        <div className={`h-3 w-24 ${block}`} />
        <div className={`h-11 w-full ${block}`} />
      </div>
      {/* Submit */}
      <div className={`h-11 w-full ${block}`} />
    </div>
  );
}
