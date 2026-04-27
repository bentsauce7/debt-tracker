export const metadata = {
  title: 'Privacy Policy — Debt Tracker',
};

export default function PrivacyPage() {
  const updated = 'April 27, 2026';

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground mt-1">Last updated: {updated}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p>
          Debt Tracker is a private household application used exclusively by two authorized
          users to monitor revolving credit account balances and liabilities. This policy
          describes how financial data is collected, stored, and used within the application.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data We Collect</h2>
        <p>
          We use Plaid to connect to financial institutions. Through Plaid, we retrieve:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Account names, types, masks, and balances</li>
          <li>Credit limits and available credit</li>
          <li>Statement balances, minimum payments, and due dates</li>
          <li>Annual percentage rates (APRs) by type</li>
          <li>Last payment amounts and dates</li>
        </ul>
        <p>
          We do not collect or store transaction-level data, Social Security numbers,
          full account numbers, or login credentials for any financial institution.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How We Use Your Data</h2>
        <p>
          Financial data is used solely to display account balances, debt totals, APR
          summaries, and payment due dates within the application. It is never sold,
          shared, or transmitted to any third party other than Plaid (which is used
          to retrieve the data from your financial institutions).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data Storage and Security</h2>
        <p>
          All data is stored in a private, password-protected database hosted on Neon
          (a serverless PostgreSQL provider). Plaid access tokens — the credentials
          used to retrieve account data — are encrypted at rest using AES-256-GCM
          encryption before being stored. Access to the application is protected by
          multi-factor authentication via Clerk.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Third-Party Services</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Plaid</strong> — used to securely connect to financial institutions
            and retrieve account and liability data. Plaid&apos;s privacy policy is available
            at{' '}
            <a href="https://plaid.com/legal/privacy-policy" className="underline">
              plaid.com/legal/privacy-policy
            </a>
            .
          </li>
          <li>
            <strong>Clerk</strong> — used for user authentication and multi-factor
            authentication. Clerk&apos;s privacy policy is available at{' '}
            <a href="https://clerk.com/legal/privacy" className="underline">
              clerk.com/legal/privacy
            </a>
            .
          </li>
          <li>
            <strong>Neon</strong> — used for database hosting. Data is stored in an
            isolated private database accessible only to this application.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data Retention and Deletion</h2>
        <p>
          Financial data is retained as long as the application is in use. You may
          disconnect any financial institution at any time through the application,
          which removes the associated access token and stops future data retrieval.
          To request deletion of all stored data, contact the application owner
          directly.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Access</h2>
        <p>
          This application is restricted to two authorized household users. No data
          is accessible to the public or any other party.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          For questions about this privacy policy or to request data deletion, contact{' '}
          <a href="mailto:davidbentler@gmail.com" className="underline">
            davidbentler@gmail.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
