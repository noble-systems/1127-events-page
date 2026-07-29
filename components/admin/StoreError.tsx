/**
 * Shown when DynamoDB can't be reached. The dashboard genuinely cannot work
 * without the store, so this states the problem plainly instead of rendering
 * an empty list that looks like "you have no events".
 */
export function StoreError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="border-terracotta/45 bg-terracotta/[0.06] rounded-2xl border p-8"
    >
      <h2 className="font-display text-2xl">The data store is unreachable</h2>
      <p className="text-ink/75 mt-3 max-w-xl text-[0.9375rem] leading-relaxed">
        Nothing has been lost, the dashboard just can&apos;t read from DynamoDB
        right now. Check that <code>EVENTS_TABLE</code> and{" "}
        <code>SUBMISSIONS_TABLE</code> are set in the Amplify environment and that
        the compute role has the <code>1127-events-app-data</code> policy attached,
        then redeploy.
      </p>
      <p className="bg-ink/[0.06] text-ink/70 mt-4 rounded-lg px-3.5 py-2.5 font-mono text-[0.8125rem] break-words">
        {message}
      </p>
    </div>
  );
}
