"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPaymentMethod } from "@/lib/payments";

/**
 * Remembers the buyer's payment method (picked on a brand page or at
 * checkout): cookie for guests, plus the user row when logged in, so cart
 * and checkout show the same method everywhere.
 */
export async function setPaymentMethodAction(methodId: string): Promise<void> {
  if (!getPaymentMethod(methodId)) return;
  (await cookies()).set("gifts19_paymethod", methodId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const user = await getSessionUser();
  if (user) {
    await db.user.update({
      where: { id: user.id },
      data: { preferredPaymentMethod: methodId },
    });
  }
  revalidatePath("/", "layout");
}

/** Adds/removes a brand from the logged-in user's favourites. */
export async function toggleFavoriteAction(
  brandId: string,
  brandSlug: string,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/brands/${brandSlug}`)}`);
  }
  const existing = await db.favorite.findUnique({
    where: { userId_brandId: { userId: user.id, brandId } },
  });
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
  } else {
    await db.favorite.create({ data: { userId: user.id, brandId } });
  }
  revalidatePath(`/brands/${brandSlug}`);
  revalidatePath("/account");
}
