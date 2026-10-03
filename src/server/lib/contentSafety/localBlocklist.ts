import blockedTerms from '@server/content/blocked-terms.json';
import {createLocalBlocklist} from '@shared/contentSafety/localBlocklist';
export {normalizeContentForModeration} from '@shared/contentSafety/localBlocklist';
export const {findLocalContentViolation,getLocalBlocklistStats}=createLocalBlocklist(blockedTerms);
