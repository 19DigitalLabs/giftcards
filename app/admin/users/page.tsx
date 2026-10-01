import { adminSetUserBlockedAction } from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMessage, smallButton, Table, td } from "@/components/admin-ui";
import { inputClasses } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q.trim() : "";
  const users = await db.user.findMany({
    where: q ? { email: { contains: q, mode: "insensitive" } } : {},
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <AdminMessage msg={p.msg} />
      <h1 className="font-display text-3xl font-extrabold">Users</h1>
      <form className="mt-5 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search email"
          className={inputClasses}
        />
        <button className="h-12 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Search
        </button>
      </form>
      <div className="mt-6">
        <Table
          head={[
            "Email",
            "Name",
            "Role",
            "Status",
            "Verified",
            "Orders",
            "Joined",
            "",
          ]}
        >
          {users.map((u) => (
            <tr key={u.id}>
              <td className={td}>{u.email}</td>
              <td className={td}>{u.name}</td>
              <td className={`${td} font-mono text-xs`}>{u.role}</td>
              <td
                className={`${td} font-mono text-xs ${u.status === "BLOCKED" ? "text-pink" : ""}`}
              >
                {u.status}
              </td>
              <td className={td}>{u.emailVerifiedAt ? "✓" : "—"}</td>
              <td className={td}>{u._count.orders}</td>
              <td className={`${td} text-xs`}>
                {u.createdAt.toLocaleDateString("en-IN")}
              </td>
              <td className={td}>
                {isAdmin && u.id !== staff.id && (
                  <form
                    action={adminSetUserBlockedAction.bind(
                      null,
                      u.id,
                      u.status !== "BLOCKED",
                    )}
                  >
                    <button className={smallButton}>
                      {u.status === "BLOCKED" ? "Unblock" : "Block"}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
