export type SectOnboardingState = 'loading' | 'none' | 'joined';

export function resolveSectOnboardingRedirect(
  pathname: string,
  hasActiveCultivator: boolean,
  state: SectOnboardingState,
  search = '',
): string | null {
  const onboardingPath = '/game/sect/onboarding';
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(search);
  const hasSelectedSect = Boolean(searchParams.get('sectId'));
  if (!hasActiveCultivator || state === 'loading') return null;
  if (state === 'none' && normalizedPath !== onboardingPath)
    return onboardingPath;
  if (
    state === 'joined' &&
    normalizedPath === onboardingPath &&
    !hasSelectedSect
  ) {
    return '/game/sect';
  }
  return null;
}
