import type { ReactNode } from "react";
import { navigate } from "./mock-navigation";
const demoGetToken = async () => "demo-token-local-only";
export const useAuth = () => ({ isLoaded: true, isSignedIn: true, userId: "dev-example", getToken: demoGetToken });
export function Show({ when, children }: { when: string; children: ReactNode }) { return when === "signed-in" ? children : null; }
export function SignInButton({ children }: { children: ReactNode }) { return children; }
export const SignUpButton = SignInButton;
export function UserButton() { return <button type="button" className="header-sign-in" onClick={() => navigate("/account")}>Akun demo</button>; }
export const useClerk = () => ({ signOut: async () => {}, openUserProfile: () => {}, openSignIn: () => {} });

export const useUser = () => ({ user: { id: "dev-example", imageUrl: "", fullName: "Akun demo", primaryEmailAddress: { emailAddress: "demo@example.test" } } });
