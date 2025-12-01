/**
 * Subscriptions Store Tests
 *
 * Tests for Svelte 5 runes-based subscription state management.
 * Validates: P17.1-P17.4, AC3.5, AC3.6, AC3.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { subscriptionsStore, type Subscription, type Currency, type BillingCycle } from './subscriptions.svelte';

describe('Subscriptions Store', () => {
	// Helper to create test subscriptions
	const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
		id: `sub-${Math.random().toString(36).slice(2)}`,
		userId: 'user-123',
		serviceName: 'Test Service',
		cost: 10,
		currency: 'USD' as Currency,
		billingCycle: 'monthly' as BillingCycle,
		nextRenewal: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
		startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
		isTrial: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	});

	// Test data
	const monthlySubscription: Subscription = createSubscription({
		id: 'sub-1',
		serviceName: 'GitHub',
		cost: 10,
		currency: 'USD',
		billingCycle: 'monthly',
	});

	const yearlySubscription: Subscription = createSubscription({
		id: 'sub-2',
		serviceName: 'Cloudflare',
		cost: 120,
		currency: 'USD',
		billingCycle: 'yearly',
	});

	const customSubscription: Subscription = createSubscription({
		id: 'sub-3',
		serviceName: 'Custom Service',
		cost: 50,
		currency: 'CAD',
		billingCycle: 'custom',
		billingCycleDays: 90, // Quarterly
	});

	const trialSubscription: Subscription = createSubscription({
		id: 'sub-4',
		serviceName: 'Trial Service',
		cost: 20,
		currency: 'USD',
		billingCycle: 'monthly',
		isTrial: true,
		trialEndDate: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days from now
	});

	beforeEach(() => {
		// Clear store before each test
		subscriptionsStore.clear();
	});

	describe('Initial State', () => {
		it('should start with empty state', () => {
			expect(subscriptionsStore.subscriptions).toEqual([]);
			expect(subscriptionsStore.isLoading).toBe(false);
			expect(subscriptionsStore.error).toBeNull();
		});

		it('should have zero count initially', () => {
			expect(subscriptionsStore.subscriptionCount).toBe(0);
		});

		it('should have zero spending initially', () => {
			expect(subscriptionsStore.totalMonthlySpending).toBe(0);
			expect(subscriptionsStore.totalYearlySpending).toBe(0);
		});
	});

	describe('Subscriptions CRUD', () => {
		describe('setSubscriptions', () => {
			it('should set all subscriptions', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);

				expect(subscriptionsStore.subscriptions).toHaveLength(2);
				expect(subscriptionsStore.subscriptionCount).toBe(2);
			});
		});

		describe('addSubscription', () => {
			it('should add a new subscription', () => {
				subscriptionsStore.addSubscription(monthlySubscription);

				expect(subscriptionsStore.subscriptions).toHaveLength(1);
				expect(subscriptionsStore.subscriptions[0]).toEqual(monthlySubscription);
			});

			it('should increment subscription count', () => {
				subscriptionsStore.addSubscription(monthlySubscription);
				subscriptionsStore.addSubscription(yearlySubscription);

				expect(subscriptionsStore.subscriptionCount).toBe(2);
			});
		});

		describe('updateSubscription', () => {
			it('should update an existing subscription', () => {
				subscriptionsStore.addSubscription(monthlySubscription);
				subscriptionsStore.updateSubscription('sub-1', { serviceName: 'GitHub Enterprise' });

				expect(subscriptionsStore.subscriptions[0].serviceName).toBe('GitHub Enterprise');
			});

			it('should update the updatedAt timestamp', () => {
				subscriptionsStore.addSubscription(monthlySubscription);
				const originalUpdatedAt = subscriptionsStore.subscriptions[0].updatedAt;

				subscriptionsStore.updateSubscription('sub-1', { cost: 15 });

				expect(subscriptionsStore.subscriptions[0].updatedAt).not.toBe(originalUpdatedAt);
			});

			it('should not modify non-existent subscription', () => {
				subscriptionsStore.addSubscription(monthlySubscription);
				subscriptionsStore.updateSubscription('non-existent', { serviceName: 'Test' });

				expect(subscriptionsStore.subscriptions).toHaveLength(1);
				expect(subscriptionsStore.subscriptions[0].serviceName).toBe('GitHub');
			});
		});

		describe('removeSubscription', () => {
			it('should remove a subscription', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);
				subscriptionsStore.removeSubscription('sub-1');

				expect(subscriptionsStore.subscriptions).toHaveLength(1);
				expect(subscriptionsStore.subscriptions[0].id).toBe('sub-2');
			});
		});

		describe('getSubscription', () => {
			it('should return subscription by ID', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);

				const subscription = subscriptionsStore.getSubscription('sub-1');

				expect(subscription).toEqual(monthlySubscription);
			});

			it('should return undefined for non-existent ID', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription]);

				const subscription = subscriptionsStore.getSubscription('non-existent');

				expect(subscription).toBeUndefined();
			});
		});
	});


	describe('Monthly Spending Calculation (P17.1)', () => {
		it('should calculate monthly spending for monthly subscriptions', () => {
			subscriptionsStore.addSubscription(monthlySubscription); // $10/month

			expect(subscriptionsStore.totalMonthlySpending).toBe(10);
		});

		it('should calculate monthly spending for yearly subscriptions (cost / 12)', () => {
			subscriptionsStore.addSubscription(yearlySubscription); // $120/year = $10/month

			expect(subscriptionsStore.totalMonthlySpending).toBe(10);
		});

		it('should calculate monthly spending for custom cycle subscriptions', () => {
			subscriptionsStore.addSubscription(customSubscription); // $50/90 days * 30 = ~$16.67/month

			const expected = (50 / 90) * 30;
			expect(subscriptionsStore.totalMonthlySpending).toBeCloseTo(expected, 2);
		});

		it('should sum monthly spending across all subscriptions', () => {
			subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);
			// $10/month + $120/12 = $10 + $10 = $20

			expect(subscriptionsStore.totalMonthlySpending).toBe(20);
		});
	});

	describe('Yearly Spending Calculation (P17.2)', () => {
		it('should calculate yearly spending for monthly subscriptions (cost * 12)', () => {
			subscriptionsStore.addSubscription(monthlySubscription); // $10/month * 12 = $120/year

			expect(subscriptionsStore.totalYearlySpending).toBe(120);
		});

		it('should calculate yearly spending for yearly subscriptions', () => {
			subscriptionsStore.addSubscription(yearlySubscription); // $120/year

			expect(subscriptionsStore.totalYearlySpending).toBe(120);
		});

		it('should calculate yearly spending for custom cycle subscriptions', () => {
			subscriptionsStore.addSubscription(customSubscription); // $50/90 days * 365 = ~$202.78/year

			const expected = (50 / 90) * 365;
			expect(subscriptionsStore.totalYearlySpending).toBeCloseTo(expected, 2);
		});

		it('should sum yearly spending across all subscriptions', () => {
			subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);
			// $10*12 + $120 = $120 + $120 = $240

			expect(subscriptionsStore.totalYearlySpending).toBe(240);
		});
	});

	describe('Spending by Currency', () => {
		it('should group spending by currency', () => {
			subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription, customSubscription]);

			const summaries = subscriptionsStore.monthlySpendingByCurrency;

			expect(summaries).toHaveLength(2); // USD and CAD

			const usdSummary = summaries.find((s) => s.currency === 'USD');
			const cadSummary = summaries.find((s) => s.currency === 'CAD');

			expect(usdSummary).toBeDefined();
			expect(cadSummary).toBeDefined();

			// USD: $10 + $10 = $20/month
			expect(usdSummary!.monthly).toBe(20);
			// CAD: $50/90*30 = ~$16.67/month
			expect(cadSummary!.monthly).toBeCloseTo((50 / 90) * 30, 2);
		});
	});

	describe('Upcoming Renewals (P17.3)', () => {
		it('should return subscriptions renewing in next 30 days', () => {
			const soonRenewal = createSubscription({
				id: 'soon',
				nextRenewal: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days
			});
			const laterRenewal = createSubscription({
				id: 'later',
				nextRenewal: Date.now() + 45 * 24 * 60 * 60 * 1000, // 45 days
			});

			subscriptionsStore.setSubscriptions([soonRenewal, laterRenewal]);

			const upcoming = subscriptionsStore.upcomingRenewals;

			expect(upcoming).toHaveLength(1);
			expect(upcoming[0].id).toBe('soon');
		});

		it('should sort upcoming renewals by date', () => {
			const renewal1 = createSubscription({
				id: 'r1',
				nextRenewal: Date.now() + 20 * 24 * 60 * 60 * 1000, // 20 days
			});
			const renewal2 = createSubscription({
				id: 'r2',
				nextRenewal: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days
			});
			const renewal3 = createSubscription({
				id: 'r3',
				nextRenewal: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days
			});

			subscriptionsStore.setSubscriptions([renewal1, renewal2, renewal3]);

			const upcoming = subscriptionsStore.upcomingRenewals;

			expect(upcoming[0].id).toBe('r2');
			expect(upcoming[1].id).toBe('r3');
			expect(upcoming[2].id).toBe('r1');
		});

		it('should exclude past renewals', () => {
			const pastRenewal = createSubscription({
				id: 'past',
				nextRenewal: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
			});
			const futureRenewal = createSubscription({
				id: 'future',
				nextRenewal: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days
			});

			subscriptionsStore.setSubscriptions([pastRenewal, futureRenewal]);

			const upcoming = subscriptionsStore.upcomingRenewals;

			expect(upcoming).toHaveLength(1);
			expect(upcoming[0].id).toBe('future');
		});
	});

	describe('Subscriptions by Renewal (P17.4)', () => {
		it('should sort all subscriptions by next renewal date', () => {
			const sub1 = createSubscription({
				id: 's1',
				nextRenewal: Date.now() + 30 * 24 * 60 * 60 * 1000,
			});
			const sub2 = createSubscription({
				id: 's2',
				nextRenewal: Date.now() + 10 * 24 * 60 * 60 * 1000,
			});
			const sub3 = createSubscription({
				id: 's3',
				nextRenewal: Date.now() + 20 * 24 * 60 * 60 * 1000,
			});

			subscriptionsStore.setSubscriptions([sub1, sub2, sub3]);

			const sorted = subscriptionsStore.subscriptionsByRenewal;

			expect(sorted[0].id).toBe('s2');
			expect(sorted[1].id).toBe('s3');
			expect(sorted[2].id).toBe('s1');
		});
	});

	describe('Trial Subscriptions', () => {
		it('should filter trial subscriptions', () => {
			subscriptionsStore.setSubscriptions([monthlySubscription, trialSubscription]);

			const trials = subscriptionsStore.trialSubscriptions;

			expect(trials).toHaveLength(1);
			expect(trials[0].id).toBe('sub-4');
		});

		it('should identify expiring trials (within 7 days)', () => {
			const expiringTrial = createSubscription({
				id: 'expiring',
				isTrial: true,
				trialEndDate: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
			});
			const laterTrial = createSubscription({
				id: 'later',
				isTrial: true,
				trialEndDate: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days
			});

			subscriptionsStore.setSubscriptions([expiringTrial, laterTrial]);

			const expiring = subscriptionsStore.expiringTrials;

			expect(expiring).toHaveLength(1);
			expect(expiring[0].id).toBe('expiring');
		});

		it('should exclude expired trials', () => {
			const expiredTrial = createSubscription({
				id: 'expired',
				isTrial: true,
				trialEndDate: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
			});
			const activeTrial = createSubscription({
				id: 'active',
				isTrial: true,
				trialEndDate: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days
			});

			subscriptionsStore.setSubscriptions([expiredTrial, activeTrial]);

			const expiring = subscriptionsStore.expiringTrials;

			expect(expiring).toHaveLength(1);
			expect(expiring[0].id).toBe('active');
		});
	});

	describe('Helper Methods', () => {
		describe('getDaysUntilRenewal', () => {
			it('should calculate days until renewal', () => {
				const sub = createSubscription({
					nextRenewal: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days
				});

				const days = subscriptionsStore.getDaysUntilRenewal(sub);

				expect(days).toBe(10);
			});

			it('should return negative for past renewals', () => {
				const sub = createSubscription({
					nextRenewal: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
				});

				const days = subscriptionsStore.getDaysUntilRenewal(sub);

				expect(days).toBe(-5);
			});
		});

		describe('getDaysUntilTrialEnds', () => {
			it('should calculate days until trial ends', () => {
				const sub = createSubscription({
					isTrial: true,
					trialEndDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
				});

				const days = subscriptionsStore.getDaysUntilTrialEnds(sub);

				expect(days).toBe(7);
			});

			it('should return null for non-trial subscriptions', () => {
				const sub = createSubscription({ isTrial: false });

				const days = subscriptionsStore.getDaysUntilTrialEnds(sub);

				expect(days).toBeNull();
			});

			it('should return null for trials without end date', () => {
				const sub = createSubscription({
					isTrial: true,
					trialEndDate: undefined,
				});

				const days = subscriptionsStore.getDaysUntilTrialEnds(sub);

				expect(days).toBeNull();
			});
		});
	});

	describe('Search and Filter', () => {
		describe('searchSubscriptions', () => {
			it('should filter subscriptions by service name', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);

				const results = subscriptionsStore.searchSubscriptions('git');

				expect(results).toHaveLength(1);
				expect(results[0].serviceName).toBe('GitHub');
			});

			it('should be case-insensitive', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription]);

				const results = subscriptionsStore.searchSubscriptions('GITHUB');

				expect(results).toHaveLength(1);
			});

			it('should return all subscriptions for empty query', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);

				const results = subscriptionsStore.searchSubscriptions('');

				expect(results).toHaveLength(2);
			});
		});

		describe('filterByBillingCycle', () => {
			it('should filter by billing cycle', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription, customSubscription]);

				const monthly = subscriptionsStore.filterByBillingCycle('monthly');
				const yearly = subscriptionsStore.filterByBillingCycle('yearly');
				const custom = subscriptionsStore.filterByBillingCycle('custom');

				expect(monthly).toHaveLength(1);
				expect(yearly).toHaveLength(1);
				expect(custom).toHaveLength(1);
			});
		});

		describe('filterByCurrency', () => {
			it('should filter by currency', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription, customSubscription]);

				const usd = subscriptionsStore.filterByCurrency('USD');
				const cad = subscriptionsStore.filterByCurrency('CAD');

				expect(usd).toHaveLength(2);
				expect(cad).toHaveLength(1);
			});
		});
	});

	describe('Optimistic Updates', () => {
		describe('rollback', () => {
			it('should restore previous state', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription]);
				subscriptionsStore.addSubscription(yearlySubscription);
				subscriptionsStore.rollback();

				expect(subscriptionsStore.subscriptions).toHaveLength(1);
				expect(subscriptionsStore.subscriptions[0].id).toBe('sub-1');
			});
		});

		describe('commit', () => {
			it('should clear snapshot after commit', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription]);
				subscriptionsStore.addSubscription(yearlySubscription);
				subscriptionsStore.commit();

				// After commit, rollback should restore to empty
				subscriptionsStore.rollback();

				expect(subscriptionsStore.subscriptions).toHaveLength(0);
			});
		});
	});

	describe('Loading & Error State', () => {
		describe('setLoading', () => {
			it('should set loading state', () => {
				subscriptionsStore.setLoading(true);
				expect(subscriptionsStore.isLoading).toBe(true);

				subscriptionsStore.setLoading(false);
				expect(subscriptionsStore.isLoading).toBe(false);
			});
		});

		describe('setError', () => {
			it('should set error state', () => {
				subscriptionsStore.setError('Something went wrong');
				expect(subscriptionsStore.error).toBe('Something went wrong');
			});
		});

		describe('clearError', () => {
			it('should clear error state', () => {
				subscriptionsStore.setError('Error');
				subscriptionsStore.clearError();
				expect(subscriptionsStore.error).toBeNull();
			});
		});
	});

	describe('Bulk Operations', () => {
		describe('clear', () => {
			it('should clear all state', () => {
				subscriptionsStore.setSubscriptions([monthlySubscription, yearlySubscription]);
				subscriptionsStore.setLoading(true);
				subscriptionsStore.setError('Error');

				subscriptionsStore.clear();

				expect(subscriptionsStore.subscriptions).toEqual([]);
				expect(subscriptionsStore.isLoading).toBe(false);
				expect(subscriptionsStore.error).toBeNull();
			});
		});

		describe('loadSubscriptions', () => {
			it('should load subscriptions and clear loading/error', () => {
				subscriptionsStore.setLoading(true);
				subscriptionsStore.setError('Previous error');

				subscriptionsStore.loadSubscriptions([monthlySubscription, yearlySubscription]);

				expect(subscriptionsStore.subscriptions).toHaveLength(2);
				expect(subscriptionsStore.isLoading).toBe(false);
				expect(subscriptionsStore.error).toBeNull();
			});
		});
	});
});
