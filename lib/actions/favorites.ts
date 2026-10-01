"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Adds/removes a brand from the signed-in user's favourites. */
export async function toggleFavoriteAction(
  brandId: string,
  brandSlug: string,
): Promise<void> {
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/brands/${brandSlug}`)}`);
  const brand = await db.brand.findUnique({ where: { id: brandId } });
  if (!brand) return;
  const existing = await db.favorite.findUnique({
    where: { userId_brandId: { userId: user.id, brandId } },
  });
  if (existing) await db.favorite.delete({ where: { id: existing.id } });
  else await db.favorite.create({ data: { userId: user.id, brandId } });
  revalidatePath(`/brands/${brandSlug}`);
  revalidatePath("/account");
}
