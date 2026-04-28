const MX_PROXY_URL = process.env.MX_PROXY_URL!;
const MX_PROXY_SECRET = process.env.MX_PROXY_SECRET!;

async function mxFetch(path: string, options?: RequestInit): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${MX_PROXY_URL}/mx${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-secret': MX_PROXY_SECRET,
      ...(options?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { status: res.status, data };
}

export async function getOrCreateMxUserGuid(clientUserId: string): Promise<string> {
  const { status, data } = await mxFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ user: { id: clientUserId } }),
  });
  if (status === 200 || status === 201) {
    return (data as { user: { guid: string } }).user.guid;
  }
  if (status === 409) {
    // User already exists — find by listing (MX has no GET-by-client-id endpoint)
    const { data: listData } = await mxFetch('/users?per_page=100');
    const users = (listData as { users: Array<{ guid: string; id: string }> }).users ?? [];
    const found = users.find((u) => u.id === clientUserId);
    if (found) return found.guid;
  }
  throw new Error(`Failed to get MX user: ${JSON.stringify(data)}`);
}

export async function getMxWidgetUrl(userGuid: string): Promise<string> {
  const { data } = await mxFetch(`/users/${userGuid}/widget_urls`, {
    method: 'POST',
    body: JSON.stringify({
      widget_url: { widget_type: 'connect_widget', include_transactions: false },
    }),
  });
  return (data as { widget_url: { url: string } }).widget_url.url;
}

export async function getMxMember(userGuid: string, memberGuid: string) {
  const { data } = await mxFetch(`/users/${userGuid}/members/${memberGuid}`);
  return (data as { member: MxMember }).member;
}

export async function getMxMemberAccounts(userGuid: string, memberGuid: string): Promise<MxAccount[]> {
  const { data } = await mxFetch(`/users/${userGuid}/members/${memberGuid}/accounts`);
  return (data as { accounts: MxAccount[] }).accounts ?? [];
}

export async function deleteMxMember(userGuid: string, memberGuid: string): Promise<void> {
  await mxFetch(`/users/${userGuid}/members/${memberGuid}`, { method: 'DELETE' });
}

export interface MxMember {
  guid: string;
  user_guid: string;
  name: string;
  institution_code: string;
  connection_status: string;
}

export interface MxAccount {
  guid: string;
  name: string;
  account_type: string;
  account_number_suffix: string | null;
  balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  is_closed: boolean;
}

const MX_CREDIT_TYPES = new Set(['CREDIT_CARD', 'LINE_OF_CREDIT']);

export function isMxCreditAccount(account: MxAccount): boolean {
  return MX_CREDIT_TYPES.has(account.account_type) && !account.is_closed;
}
