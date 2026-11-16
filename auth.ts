import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowedDomain } from "@/lib/config";
import { hostedDomainFromIdToken, isAllowedWorkspaceUser } from "@/lib/auth/domain";

const domain = allowedDomain();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? undefined : "dev-only-secret-not-for-production"),
  providers: [
    Google({
      authorization: {
        params: {
          hd: domain,
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ profile, account }) {
      if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) return false;
      const hd = (profile as { hd?: string } | undefined)?.hd || hostedDomainFromIdToken(account?.id_token);
      return isAllowedWorkspaceUser({
        email: profile?.email,
        hd,
        emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified === true,
        domain,
      });
    },
    async jwt({ token, profile, account }) {
      if (profile) {
        const hd = (profile as { hd?: string }).hd || hostedDomainFromIdToken(account?.id_token);
        const allowed = isAllowedWorkspaceUser({
          email: profile.email,
          hd,
          emailVerified: (profile as { email_verified?: boolean }).email_verified === true,
          domain,
        });
        (token as { allowed?: boolean }).allowed = allowed;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { allowed?: boolean }).allowed = Boolean((token as { allowed?: boolean }).allowed);
      }
      return session;
    },
  },
});
