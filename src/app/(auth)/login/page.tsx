import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const sp = await searchParams;
  const redirectTo = sp.redirect ?? "/dashboard";
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <LoginForm redirectTo={redirectTo} />
    </main>
  );
}
