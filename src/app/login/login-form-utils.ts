export function isSignInButtonDisabled(
  password: string,
  isLoading: boolean,
  isDevelopment = process.env.NODE_ENV === "development"
): boolean {
  if (isLoading) return true;
  if (isDevelopment) return password.trim().length === 0;
  return !password;
}
