import { SignUp } from "@clerk/nextjs";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { clerkAuthAppearance } from "@/components/auth/clerk-auth-appearance";

export default function SignUpPage() {
  return (
    <AuthPageShell
      accentTitle="barumu."
      description="Daftar memakai email aktif supaya akunmu mudah dikenali dan dipulihkan."
      title="Buat akun"
    >
      <SignUp
        appearance={clerkAuthAppearance}
        fallbackRedirectUrl="/"
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    </AuthPageShell>
  );
}
