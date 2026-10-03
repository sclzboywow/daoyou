import {it,expect} from 'vitest';
import {isSettledDungeonBattle} from './battleOccupancy';
it('releases only current terminal battles with committed settlement',()=>{
  expect(isSettledDungeonBattle({settled:true,snapshot:{version:'dungeon-v6-v1',state:{phase:'ended'}}})).toBe(true);
  for(const payload of [null,{}, {settled:false,snapshot:{version:'dungeon-v6-v1',state:{phase:'ended'}}},{settled:true,snapshot:{version:'dungeon-v6-v1',state:{phase:'commands'}}},{settled:true,snapshot:{version:'legacy',state:{phase:'ended'}}},{settled:'true',snapshot:{version:'dungeon-v6-v1',state:{phase:'ended'}}}])expect(isSettledDungeonBattle(payload)).toBe(false);
});
