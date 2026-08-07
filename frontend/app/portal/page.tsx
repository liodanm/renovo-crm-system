export default function PortalRootPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Sign in required</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please use the sign-in link from your email, or contact your service provider for a new one.
        </p>
      </div>
    </main>
  );
}
