import { isValidAmbassadorCode, type Ambassador } from "./ambassadors.ts";
import {
  createAmbassador,
  deleteAmbassador,
  getAmbassador,
  moveAmbassadorClicks,
} from "./ambassadors-store.ts";
import { listSubmissions, updateSubmission } from "./store/index.ts";
import { reassignOrdersVia } from "./tickets-store.ts";

/**
 * Changing an ambassador's code, which is their identity everywhere: on
 * orders, on people, on the tap counter, in the link already sitting in
 * their bio. Same shape as an event rename: write the new row first, migrate
 * every reference, delete the old row last, so a crash part-way leaves the
 * code existing twice and a retry converges.
 *
 * The old LINK dies, deliberately: /a/OLDCODE stops attributing the moment
 * the old row is gone. The dashboard says so; hand them the new link.
 */
export async function renameAmbassador(
  oldCode: string,
  newCode: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidAmbassadorCode(newCode)) {
    return { ok: false, reason: "Codes are 3 to 20 characters: letters, numbers and hyphens." };
  }
  const existing = await getAmbassador(oldCode);
  if (!existing) return { ok: false, reason: "That ambassador does not exist." };
  if (await getAmbassador(newCode)) {
    return { ok: false, reason: "That code is already taken." };
  }

  // Field by field, not a spread: the local driver keeps its tap counter
  // inline on the row, and copying it here would double it when the counter
  // is moved properly below.
  const renamed: Ambassador = {
    code: newCode,
    name: existing.name,
    email: existing.email,
    active: existing.active,
    rewardsGiven: existing.rewardsGiven,
    rewardedEvents: existing.rewardedEvents,
    statsId: existing.statsId,
    welcomeEmailAt: existing.welcomeEmailAt,
    welcomeTicketAt: existing.welcomeTicketAt,
    welcomeTicketCode: existing.welcomeTicketCode,
    welcomeTicketManual: existing.welcomeTicketManual,
    createdAt: existing.createdAt,
  };
  const created = await createAmbassador(renamed);
  if (!created) return { ok: false, reason: "That code is already taken." };

  await reassignOrdersVia(oldCode, newCode);

  for (const row of await listSubmissions()) {
    if (row.via === oldCode) {
      await updateSubmission(row.pk, { via: newCode });
    }
  }

  await moveAmbassadorClicks(oldCode, newCode);
  await deleteAmbassador(oldCode);
  return { ok: true };
}
