import {ownerData} from './_lib/data.js';
import {handle, json} from './_lib/http.js';
import {requireOwner} from './_lib/owner.js';

/** GET /api/data: the owner's data (see ownerData). */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request);
    return json(await ownerData());
  });
}
