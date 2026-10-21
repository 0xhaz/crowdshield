import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-center min-h-screen flex-col gap-3 p-6 text-center">
      <h1 className="text-24 font-semibold text-gray-900">Page not found</h1>
      <Link href="/" className="btn-primary">
        Go to your dashboard
      </Link>
    </main>
  );
}
