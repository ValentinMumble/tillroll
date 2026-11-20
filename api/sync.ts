import {ownerData} from './_lib/data.js';
import {handle, HttpError, json} from './_lib/http.js';
import {isCron, requireOwner} from './_lib/owner.js';
import {connections, sync, syncDue} from './_lib/sync.js';

/** GET /api/sync: the daily Vercel Cron run (see vercel.json), in the background, every bank with access. */
export function GET(request: Request) {
  return handle(async () => {
    if (!isCron(request)) throw new HttpError(403, 'Only the scheduled run can call this');
    if (!(await connections()).some(connection => !connection.expired)) {
      return json({skipped: 'No bank access to sync'});
    }
    return json(await sync(null));
  });
}

/**
 * POST /api/sync: the owner's page, on Sync, and when it opens with `{"due": true}`: then only when a bank with access
 * was last synced more than 6 hours ago. The owner is there, so the banks limit less. The answer carries the owner's
 * data (see ownerData), so the page downloads it once, or `unchanged` when the `version` the page sent is the data's
 * still. When the page opens, a sync that fails still sends it, with the error.
 */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request);
    const {due, version} = ((await request.json().catch(() => ({}))) ?? {}) as {due?: boolean; version?: string};
    const latest = async () => {
      const data = await ownerData();
      return data.version === version ? {unchanged: true} : {data};
    };
    if (due && !syncDue(await connections())) return json({synced: false, ...(await latest())});
    try {
      return json({synced: true, ...(await sync(request)), ...(await latest())});
    } catch (error) {
      if (!due || !(error instanceof HttpError)) throw error;
      return json({synced: false, error: error.message, ...(await latest())});
    }
  });
}
