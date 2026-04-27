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
  itemId: text('item_id').notNull().unique(),
  accessToken: text('access_token').notNull(),
  institutionName: text('institution_name'),
  institutionId: text('institution_id'),
  cursor: text('cursor'),
  needsReauth: boolean('needs_reauth').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id')
    .notNull()
    .references(() => plaidItems.id, { onDelete: 'cascade' }),
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
  notes: text('notes'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const syncLog = pgTable('sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
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

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  item: one(plaidItems, { fields: [accounts.itemId], references: [plaidItems.id] }),
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
