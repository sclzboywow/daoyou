import {requireUser} from '@server/lib/hono/middleware';
import type {AppEnv} from '@server/lib/hono/types';
import {assertUserGeneratedContentSafe,ContentSafetyError} from '@server/lib/services/ContentSafetyService';
import {moderationInput} from '@shared/contentSafety/inputTargets';
import type {MiddlewareHandler} from 'hono';
import {findLocalContentViolation} from './localBlocklist';

export const contentSafetyInputGuard:MiddlewareHandler<AppEnv>=async(c,next)=>{
  if(!['POST','PATCH','PUT'].includes(c.req.method))return next();
  // Ignore malformed JSON here; the owning endpoint retains schema validation.
  const body=await c.req.raw.clone().json().catch(()=>undefined);
  const content=moderationInput(c.req.method,c.req.path,body);
  if(!content.length)return next();
  // New accounts have no session/OpenID yet. Keep Better Auth's OTP/captcha
  // flow intact while enforcing the same local dictionary on display names.
  if(['/api/auth/sign-up/email','/api/auth/sign-up/wechat-mini-game','/api/auth/sign-in/email-otp'].includes(c.req.path)){
    if(content.some(value=>findLocalContentViolation(value)))return c.json({success:false,error:'内容不符合社区规范，请修改后重试',code:'CONTENT_REJECTED'},400);
    return next();
  }
  return requireUser()(c,async()=>{
    try{
      await assertUserGeneratedContentSafe({userId:c.get('user')!.id,source:'user_text_input',scene:c.req.path==='/api/generate-character'?1:2,content});
    }catch(error){
      if(error instanceof ContentSafetyError){c.res=c.json({success:false,error:error.message,code:error.code},error.status);return;}
      throw error;
    }
    await next();
  });
};

const displayKeys=new Set(['name','title','description','text','textContent','content','message','backstory','biography','story','taunt','nickname']);
function redactDisplay(value:unknown,key=''):unknown{
  if(typeof value==='string')return displayKeys.has(key)&&findLocalContentViolation(value)?'内容暂不展示':value;
  if(Array.isArray(value))return value.map(item=>redactDisplay(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,redactDisplay(item,field)]));
  return value;
}
export const contentSafetyDisplayGuard:MiddlewareHandler<AppEnv>=async(c,next)=>{
  await next();
  if(!c.res.ok||!c.res.headers.get('content-type')?.includes('application/json'))return;
  const data=await c.res.clone().json().catch(()=>undefined);
  if(data===undefined)return;
  const before=JSON.stringify(data),after=JSON.stringify(redactDisplay(data));
  if(before===after)return;
  const headers=new Headers(c.res.headers);headers.delete('content-length');headers.delete('etag');
  c.res=new Response(after,{status:c.res.status,headers});
};
