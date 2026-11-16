import { auth } from "@/auth";
import { LibraryApp } from "@/components/library/library-app";
import { LogoutButton } from "@/components/logout-button";
import { authBypassEnabled } from "@/lib/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (authBypassEnabled()) {
    return <LibraryApp userName="開発ユーザー" mock />;
  }
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const name = session.user?.name || email;
  return <LibraryApp userName={name} mock={false} logout={<LogoutButton name={name} />} />;
}
