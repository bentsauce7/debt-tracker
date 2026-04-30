import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  numeric,
  date,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const plaidItems = pgTable('plaid_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),
  itemId: text('item_id').notNull().unique(),
  accessToken: text('access_token').notNull(),
  institutionName: text('institution_name'),
  institutionId: text('institution_id'),
  cursor: text('cursor'),
  needsReauth: boolean('needs_reauth').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const mxMembers = pgTable('mx_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),
  userGuid: text('user_guid').notNull(),
  memberGuid: text('member_guid').notNull().unique(),
  institutionCode: text('institution_code'),
  institutionName: text('institution_name'),
  connectionStatus: text('connection_status').notNull().default('CONNECTED'),
  needsReauth: boolean('needs_reauth').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').references(() => plaidItems.id, { onDelete: 'cascade' }),
  mxMemberId: uuid('mx_member_id').references(() => mxMembers.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().unique(),
  name: text('name').notNull(),
  mask: text('mask'),
  officialName: text('official_name'),
  type: text('type').notNull(),
  subtype: text('subtype'),
  currentBalance: numeric('current_balance', { precision: 12, scale: 2 }),
  availableBalance: numeric('available_balance', { precision: 12, scale: 2 }),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }),
  isOverdue: boolean('is_overdue').default(false),
  lastSyncedAt: timestamp('last_synced_at'),
});

export const liabilities = pgTable('liabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id')
    .notNull()
    .unique()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  lastStatementBalance: numeric('last_statement_balance', { precision: 12, scale: 2 }),
  lastStatementIssueDate: date('last_statement_issue_date'),
  minimumPaymentAmount: numeric('minimum_payment_amount', { precision: 12, scale: 2 }),
  nextPaymentDueDate: date('next_payment_due_date'),
  lastPaymentAmount: numeric('last_payment_amount', { precision: 12, scale: 2 }),
  lastPaymentDate: date('last_payment_date'),
});

export const aprs = pgTable('aprs', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  aprPercentage: numeric('apr_percentage', { precision: 6, scale: 3 }),
  aprType: text('apr_type').notNull(),
  balanceSubjectToApr: numeric('balance_subject_to_apr', { precision: 12, scale: 2 }),
  interestChargeAmount: numeric('interest_charge_amount', { precision: 12, scale: 2 }),
});

export const manualOverrides = pgTable('manual_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id')
    .notNull()
    .unique()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  promoExpirationDate: date('promo_expiration_date'),
  isDeferredInterest: boolean('is_deferred_interest').default(false),
  promoAprPercentage: numeric('promo_apr_percentage', { precision: 6, scale: 3 }),
  promoBalance: numeric('promo_balance', { precision: 12, scale: 2 }),
  accruedDeferredInterest: numeric('accrued_deferred_interest', { precision: 12, scale: 2 }),
  notes: text('notes'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  transactionId: text('transaction_id').notNull().unique(),
  name: text('name').notNull(),
  merchantName: text('merchant_name'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  pending: boolean('pending').notNull().default(false),
});

export const promoPurchases = pgTable('promo_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  description: text('description'),
  purchaseAmount: numeric('purchase_amount', { precision: 12, scale: 2 }).notNull(),
  purchaseDate: date('purchase_date'),
  promoEndDate: date('promo_end_date').notNull(),
  isDeferredInterest: boolean('is_deferred_interest').notNull().default(false),
  feeAmount: numeric('fee_amount', { precision: 12, scale: 4 }),
  feeType: text('fee_type'),
  feeFrequency: text('fee_frequency'),
  accruedDeferredInterest: numeric('accrued_deferred_interest', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const statements = pgTable('statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  plaidStatementId: text('plaid_statement_id').notNull().unique(),
  statementDate: date('statement_date').notNull(),
  closingBalance: numeric('closing_balance', { precision: 12, scale: 2 }),
  minimumPayment: numeric('minimum_payment', { precision: 12, scale: 2 }),
  paymentDueDate: date('payment_due_date'),
  extractedAprs: jsonb('extracted_aprs').$type<ExtractedApr[]>().default([]),
  extractedPromoPurchases: jsonb('extracted_promo_purchases').$type<ExtractedPromoPurchase[]>().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ExtractedApr = {
  type: string;
  rate: number;
  balance?: number;
  expirationDate?: string;
};

export type ExtractedPromoPurchase = {
  description: string;
  amount: number;
  purchaseDate?: string;
  promoEndDate?: string;
  isDeferredInterest: boolean;
  feeAmount?: number;
  feeType?: 'fixed' | 'percentage';
  feeFrequency?: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  accruedDeferredInterest?: number;
};

export const syncLog = pgTable('sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  itemsSynced: integer('items_synced').default(0),
  accountsUpdated: integer('accounts_updated').default(0),
  errors: jsonb('errors').$type<string[]>().default([]),
  status: text('status').notNull().default('running'),
});

export const plaidItemsRelations = relations(plaidItems, ({ many }) => ({
  accounts: many(accounts),
}));

export const mxMembersRelations = relations(mxMembers, ({ many }) => ({
  accounts: many(accounts),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  item: one(plaidItems, { fields: [accounts.itemId], references: [plaidItems.id] }),
  mxMember: one(mxMembers, { fields: [accounts.mxMemberId], references: [mxMembers.id] }),
  liability: one(liabilities, { fields: [accounts.accountId], references: [liabilities.accountId] }),
  aprs: many(aprs),
  manualOverride: one(manualOverrides, {
    fields: [accounts.accountId],
    references: [manualOverrides.accountId],
  }),
}));

export const liabilitiesRelations = relations(liabilities, ({ one }) => ({
  account: one(accounts, { fields: [liabilities.accountId], references: [accounts.accountId] }),
}));

export const aprsRelations = relations(aprs, ({ one }) => ({
  account: one(accounts, { fields: [aprs.accountId], references: [accounts.accountId] }),
}));
