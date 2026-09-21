import { SignIn } from "@clerk/nextjs";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { clerkAuthAppearance } from "@/components/auth/clerk-auth-appearance";

export default function SignInPage() {
  return (
    <AuthPageShell
      accentTitle="datang lagi!"
      description="Masuk dengan akun yang sudah kamu buat untuk melanjutkan belanja dan melihat produk digitalmu."
      title="Selamat"
    >
      <SignIn
        appearance={clerkAuthAppearance}
        fallbackRedirectUrl="/"
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </AuthPageShell>
  );
}
