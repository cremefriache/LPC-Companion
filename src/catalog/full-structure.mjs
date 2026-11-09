import Ajv from 'ajv';
import schema from '../../schemas/lpc-source-recipe.schema.json' with {type:'json'};
const check=new Ajv({strict:true,allErrors:false,ownProperties:true}).compile(schema);
export function fullRecipeStructure(value){if(check(value))return null;const e=check.errors[0];return {path:e.instancePath,keyword:e.keyword,message:e.message};}
