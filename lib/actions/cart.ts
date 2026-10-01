"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_QTY } from "@/lib/giftcards";

/** Adds a product to the cart (or bumps its quantity). */
export async function addToCartAction(formData: FormData): Promise<void> {
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity"));

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { brand: true },
  });
  if (!product) redirect("/brands");
  const back = `/brands/${product.brand.slug}`;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  const purchasable =
    product.status === "ACTIVE" &&
    product.brand.status === "ACTIVE" &&
    product.sellingPricePaise != null;
  const validQuantity =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QTY;
  if (!purchasable || !validQuantity) redirect(`${back}?unavailable=1`);

  const existing = await db.cartItem.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });
  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: {
        quantity: Math.min(existing.quantity + quantity, MAX_QTY),
        priceAtAddPaise: product.sellingPricePaise!,
      },
    });
  } else {
    await db.cartItem.create({
      data: {
        userId: user.id,
        productId,
        quantity,
        priceAtAddPaise: product.sellingPricePaise!,
      },
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
  if (quantity < 1) await db.cartItem.delete({ where: { id: itemId } });
  else
    await db.cartItem.update({
      where: { id: itemId },
      data: { quantity: Math.min(quantity, MAX_QTY) },
    });
  revalidatePath("/", "layout");
}

export async function removeItemAction(itemId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcart");
  await db.cartItem.deleteMany({ where: { id: itemId, userId: user.id } });
  revalidatePath("/", "layout");
}
