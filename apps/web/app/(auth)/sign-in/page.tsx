import { AuthForm } from "@/components/AuthForm";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  return (
    <section className="flex-center size-full max-sm:px-6">
      <AuthForm expired={expired === "1"} />
    </section>
  );
}
