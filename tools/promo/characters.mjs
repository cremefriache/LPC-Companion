import {createDefinition} from '../../src/state/defaults.mjs';
export function promoCharacters(){
 const primary=createDefinition('11111111-1111-4111-8111-111111111111');primary.identity.hair.itemId='hair_natural';primary.identity.body.paletteId=primary.identity.head.paletteId='body.ulpc.bronze';primary.startingPresentation.scene.backgroundId='woodland';
 const friend=createDefinition('22222222-2222-4222-8222-222222222222');friend.identity.bodyType='female';friend.identity.body.itemId='body_female';friend.identity.head.itemId='heads_human_female';friend.identity.hair={itemId:'hair_bob',paletteId:'hair.ulpc.blonde'};for(const o of friend.outfits)for(const s of Object.values(o.selections))s.itemId+='_female';friend.startingPresentation.scene.backgroundId='hearth';
 return [primary,friend];
}
