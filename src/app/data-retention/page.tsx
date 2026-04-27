export const metadata = {
  title: 'Data Retention and Disposal Policy — Debt Tracker',
};

export default function DataRetentionPage() {
  const updated = 'April 27, 2026';

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Retention and Disposal Policy</h1>
        <p className="text-muted-foreground mt-1">Last updated: {updated}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Purpose</h2>
        <p>
          This policy describes how Debt Tracker retains, manages, and disposes of financial
          data obtained through Plaid. It applies to all account, balance, and liability data
          retrieved from connected financial institutions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data We Retain</h2>
        <p>The following data is stored in our database while the application is in use:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Account names, types, masks, balances, and credit limits</li>
          <li>Statement balances, minimum payment amounts, and due dates</li>
          <li>Annual percentage rates (APRs) by type</li>
          <li>Last payment amounts and dates</li>
          <li>Encrypted Plaid access tokens (used to retrieve updated data)</li>
          <li>Sync history logs (timestamp, items synced, errors)</li>
        </ul>
        <p>We do not retain transaction-level data, full account numbers, or bank login credentials.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Retention Period</h2>
        <p>
          Financial data is retained for as long as the associated Plaid Item (institution
          connection) remains active. Data is refreshed on each manual sync and historical
          values are overwritten — we do not retain a history of balance changes over time.
        </p>
        <p>
          Sync logs are retained indefinitely for audit purposes but contain no personally
          identifiable financial data beyond timestamps and error messages.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Disconnecting an Institution</h2>
        <p>
          Users may disconnect any financial institution at any time. Upon disconnection:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The encrypted Plaid access token is deleted from the database immediately.</li>
          <li>
            The Plaid Item is revoked by calling the Plaid{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/item/remove</code>{' '}
            endpoint, preventing any further data retrieval.
          </li>
          <li>
            Associated account, balance, liability, and APR data is deleted from the
            database within 30 days of disconnection.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Full Data Deletion</h2>
        <p>
          To request deletion of all data stored by this application, contact the
          application owner at{' '}
          <a href="mailto:davidbentler@gmail.com" className="underline">
            davidbentler@gmail.com
          </a>
          . Upon verified request, all data will be permanently deleted from the
          database within 30 days, and all Plaid Items will be revoked.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data Security During Retention</h2>
        <p>
          All data is stored in a private Neon PostgreSQL database. Plaid access tokens are
          encrypted at rest using AES-256-GCM encryption. Access to the application and
          database is restricted to two authorized users protected by multi-factor
          authentication. No financial data is transmitted to any party other than Plaid
          for the purpose of retrieving account information.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Disposal Method</h2>
        <p>
          Data is disposed of by permanent deletion from the PostgreSQL database using
          standard SQL <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">DELETE</code>{' '}
          operations. Neon, our database provider, ensures that deleted data is not
          recoverable from their managed infrastructure after standard deletion procedures.
          No physical media disposal is required as all data is stored exclusively in
          cloud-hosted infrastructure.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Policy Review</h2>
        <p>
          This policy is reviewed annually or when significant changes are made to how
          data is collected, stored, or used. The last updated date at the top of this
          page reflects the most recent revision.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          Questions about this policy should be directed to{' '}
          <a href="mailto:davidbentler@gmail.com" className="underline">
            davidbentler@gmail.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
