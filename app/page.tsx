export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">MedAsset</h1>
      <p className="text-muted-foreground">
        Medical equipment asset and maintenance tracker for clinical engineering teams.
        The database and seed data are in place; the asset register, scanning and job
        queue arrive in milestones M2 and M3 of PLAN.md.
      </p>
    </main>
  );
}
