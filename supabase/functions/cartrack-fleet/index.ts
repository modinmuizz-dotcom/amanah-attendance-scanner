import {createFleetHandler} from './handler.js';
Deno.serve(createFleetHandler({env:(name: string) => Deno.env.get(name)}));
