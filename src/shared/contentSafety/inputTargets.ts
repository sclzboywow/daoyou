// Review only player-authored prose. IDs, passwords, codes and numeric commands
// must never be scanned as display text.
export function moderationInput(method: string, path: string, input: unknown): string[] {
  if (!input || typeof input!=='object' || Array.isArray(input) || !['POST','PATCH','PUT'].includes(method)) return [];
  const body=input as Record<string,unknown>;
  path=path.split('?')[0];
  let fields: string[]=[];
  if(path==='/api/generate-character') fields=['userInput'];
  else if(path==='/api/world-chat/messages'||path==='/api/sects/current/chat/messages') fields=['textContent'];
  else if(path==='/api/cultivator/mail/send') fields=['content','title'];
  // The production router is mounted at /api/cultivator/title. Keep the
  // legacy profile path covered too so title edits cannot bypass moderation.
  else if(path==='/api/cultivator/title'||path==='/api/cultivator/profile/title') fields=['title'];
  else if(path==='/api/craft') fields=['userPrompt'];
  else if(path==='/api/identity-reshape/session'||path==='/api/identity-reshape/generate') fields=['description'];
  else if(path==='/api/bet-battles/create') fields=['taunt'];
  else if(/^\/api\/black-market\/[^/]+\/sessions\/[^/]+\/interact$/.test(path)) fields=['message'];
  else if(path==='/api/feedback') fields=['content','title'];
  else if(path==='/api/combat-v6/beasts/rename') fields=['name'];
  else if(path==='/api/auth/update-user') fields=['name'];
  else if(['/api/auth/sign-up/email','/api/auth/sign-up/wechat-mini-game','/api/auth/sign-in/email-otp','/api/auth/email-otp/send-verification-otp'].includes(path)) fields=['name','displayName'];
  const result=fields.flatMap(field=>typeof body[field]==='string'?[body[field] as string]:[]);
  if(path==='/api/world-chat/messages'||path==='/api/sects/current/chat/messages'){
    const payload=body.payload as {text?:unknown}|undefined;
    if(typeof payload?.text==='string')result.push(payload.text);
  }
  return [...new Set(result.map(value=>value.trim()).filter(Boolean))];
}
