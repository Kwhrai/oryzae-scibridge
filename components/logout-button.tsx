import { signOut } from "@/auth";

export function LogoutButton({ name }: { name: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button className="user-chip" type="submit">{name} / ログアウト</button>
    </form>
  );
}
