import {describe,it,expect} from 'vitest';
import {createLocalBlocklist} from './localBlocklist';
import {moderationInput} from './inputTargets';
describe('restored content moderation',()=>{
  const matcher=createLocalBlocklist(['违规示例','abuse','坏','镇压']);
  it('matches punctuation, zero-width and width/case evasion',()=>{
    expect(matcher.findLocalContentViolation('违\u200b规，示 例')?.matchedTerm).toBe('违规示例');
    expect(matcher.findLocalContentViolation('ＡＢＵＳＥ')?.matchedTerm).toBe('abuse');
  });
  it('keeps confirmed neutral game prose and avoids short-word substring overblocking',()=>{
    expect(matcher.findLocalContentViolation('镇压')).toBeNull();
    expect(matcher.findLocalContentViolation('坏')).not.toBeNull();
    expect(matcher.findLocalContentViolation('坏天气')).toBeNull();
  });
  it('reviews both chat text representations and deduplicates identical text',()=>{
    expect(moderationInput('POST','/api/world-chat/messages',{textContent:'一',payload:{text:'二'}})).toEqual(['一','二']);
    expect(moderationInput('POST','/api/sects/current/chat/messages',{textContent:'一',payload:{text:'一'}})).toEqual(['一']);
  });
  it('excludes credentials, resource commands, identifiers and read requests',()=>{
    expect(moderationInput('POST','/api/auth/sign-in/email',{password:'违规示例',email:'abuse@example.test'})).toEqual([]);
    expect(moderationInput('POST','/api/cultivator/yield',{requestId:'违规示例'})).toEqual([]);
    expect(moderationInput('GET','/api/combat-v6/beasts/rename',{name:'违规示例'})).toEqual([]);
  });
  it('covers crafting, beast names and black market without inspecting IDs',()=>{
    expect(moderationInput('POST','/api/craft',{userPrompt:'炼丹',materialIds:['abuse']})).toEqual(['炼丹']);
    expect(moderationInput('POST','/api/combat-v6/beasts/rename',{name:'白虎',beastId:'abuse'})).toEqual(['白虎']);
    expect(moderationInput('POST','/api/black-market/a/sessions/b/interact',{message:'问路'})).toEqual(['问路']);
  });
});
