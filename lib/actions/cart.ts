"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_QTY, parseDenominations } from "@/lib/giftcards";

/** Adds a brand/denomination line to the cart (or bumps its quantity). */
export async function addToCartAction(formData: FormData): Promise<void> {
  const brandId = String(formData.get("brandId") ?? "");
  const denomination = Number(formData.get("denomination"));
  const quantity = Number(formData.get("quantity"));

  const brand = await db.brand.findUnique({ where: { id: brandId } });
  if (!brand) redirect("/brands");

  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/brands/${brand.slug}`)}`);
  }

  const validDenomination = parseDenominations(brand.denominations).includes(denomination);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QTY;
  if (!validDenomination || !validQuantity) redirect(`/brands/${brand.slug}`);

  const existing = await db.cartItem.findUnique({
    where: {
      userId_brandId_denomination: { userId: user.id, brandId, denomination },
    },
  });
  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { quantity: Math.min(existing.quantity + quantity, MAX_QTY) },
    });
  } else {
    await db.cartItem.create({
      data: { userId: user.id, brandId, denomination, quantity },
    });
  }

  revalidatePath("/", "layout");
  redirect("/cart");
}

/** Sets a cart line's quantity; removes the line at 0. */
export async function setQuantityAction(
  itemId: string,
  quantity: number,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcart");

  const item = await db.cartItem.findUnique({ where: { id: itemId } });
  if (!item || item.userId !== user.id) return;

  if (quantity < 1) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    await db.cartItem.update({
      where: { id: itemId },
      data: { quantity: Math.min(quantity, MAX_QTY) },
    });
  }
  revalidatePath("/", "layout");
}

export async function removeItemAction(itemId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcart");

  const item = await db.cartItem.findUnique({ where: { id: itemId } });
  if (item && item.userId === user.id) {
    await db.cartItem.delete({ where: { id: itemId } });
  }
  revalidatePath("/", "layout");
}
