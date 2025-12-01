/**
 * Subscriptions Store - Svelte 5 Runes-based Subscription State Management
 *
 * Manages subscription state including:
 * - Subscription entries (service name, cost, billing cycle, etc.)
 * - Loading states
 * - CRUD operations with optimistic updates
 * - Derived analytics (monthly/yearly spending, upcoming renewals)
 *
 * Features:
 * - Optimistic updates with rollback on failure
 * - Derived spending calculations
 * - Upcoming renewals filtering
 * - Trial expiration tracking
 *
 * Validates: P17.1-P17.4, AC3.5, AC3.6, AC3.7
 */

/**
 * Billing cycle type
 */
export type BillingCycle = 'monthly' | 'yearly' | 'custom';

/**
 * Currency type
 */
export type Currency = 'USD' | 'CAD' | 'EUR';

/**
 * Subscription interface - represents a subscription entry
 */
export interface Subscription {
	id: string;
	userId: string;
	serviceName: string;
	/** Cost in the specified currency */
	cost: number;
	/** Currency code */
	currency: Currency;
	/** Billing cycle type */
	billingCycle: BillingCycle;
	/** Custom billing cycle in days (only for 'custom' billing cycle) */
	billingCycleDays?: number;
	/** Next renewal date as Unix timestamp (milliseconds) */
	nextRenewal: number;
	/** Payment method (e.g., "•••• 1234" or "Personal Visa") */
	paymentMethod?: string;
	/** Start date as Unix timestamp (milliseconds) */
	startDate: number;
	/** Subscription tier (e.g., "Pro", "Enterprise") */
	tier?: string;
	/** Whether this is a trial subscription */
	isTrial: boolean;
	/** Trial end date as Unix timestamp (milliseconds) */
	trialEndDate?: number;
	createdAt: string;
	updatedAt: string;
}

/**
 * Spending summary by currency
 */
export interface SpendingSummary {
	currency: Currency;
	monthly: number;
	yearly: number;
}

/**
 * Subscriptions Store Class using Svelte 5 runes
 */
class SubscriptionsStore {
	// Core state using $state rune
	subscriptions = $state<Subscription[]>([]);
	isLoading = $state(false);
	error = $state<string | null>(null);

	// For optimistic updates rollback
	private previousSubscriptions: Subscription[] = [];

	// ==================== DERIVED STATE ====================


	/**
	 * Derived: Total subscription count
	 */
	get subscriptionCount(): number {
		return this.subscriptions.length;
	}

	/**
	 * Derived: Calculate monthly spending per currency
	 * P17.1: Calculate monthly spending from all subscriptions
	 *
	 * Monthly subscriptions: cost as-is
	 * Yearly subscriptions: cost / 12
	 * Custom subscriptions: (cost / billingCycleDays) * 30
	 */
	get monthlySpendingByCurrency(): SpendingSummary[] {
		const summaries = new Map<Currency, SpendingSummary>();

		for (const sub of this.subscriptions) {
			if (!summaries.has(sub.currency)) {
				summaries.set(sub.currency, {
					currency: sub.currency,
					monthly: 0,
					yearly: 0,
				});
			}

			const summary = summaries.get(sub.currency)!;
			const monthlyAmount = this.calculateMonthlyAmount(sub);
			summary.monthly += monthlyAmount;
			summary.yearly += monthlyAmount * 12;
		}

		return Array.from(summaries.values());
	}

	/**
	 * Derived: Total monthly spending (USD equivalent for display)
	 * Returns the sum of all monthly costs in their original currencies
	 * For multi-currency support, use monthlySpendingByCurrency
	 */
	get totalMonthlySpending(): number {
		return this.subscriptions.reduce((total, sub) => {
			return total + this.calculateMonthlyAmount(sub);
		}, 0);
	}

	/**
	 * Derived: Total yearly spending
	 * P17.2: Calculate yearly spending (monthly * 12 + yearly)
	 */
	get totalYearlySpending(): number {
		return this.subscriptions.reduce((total, sub) => {
			return total + this.calculateYearlyAmount(sub);
		}, 0);
	}

	/**
	 * Derived: Upcoming renewals (next 30 days)
	 * P17.3: Filter upcoming renewals (next 30 days)
	 */
	get upcomingRenewals(): Subscription[] {
		const now = Date.now();
		const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

		return this.subscriptions
			.filter((sub) => sub.nextRenewal >= now && sub.nextRenewal <= thirtyDaysFromNow)
			.sort((a, b) => a.nextRenewal - b.nextRenewal);
	}

	/**
	 * Derived: Subscriptions sorted by next renewal
	 * P17.4: Sort by next_renewal for calendar view
	 */
	get subscriptionsByRenewal(): Subscription[] {
		return [...this.subscriptions].sort((a, b) => a.nextRenewal - b.nextRenewal);
	}

	/**
	 * Derived: Trial subscriptions
	 */
	get trialSubscriptions(): Subscription[] {
		return this.subscriptions.filter((sub) => sub.isTrial);
	}

	/**
	 * Derived: Expiring trials (within 7 days)
	 */
	get expiringTrials(): Subscription[] {
		const now = Date.now();
		const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

		return this.trialSubscriptions
			.filter((sub) => sub.trialEndDate && sub.trialEndDate >= now && sub.trialEndDate <= sevenDaysFromNow)
			.sort((a, b) => (a.trialEndDate || 0) - (b.trialEndDate || 0));
	}

	// ==================== HELPER METHODS ====================

	/**
	 * Calculate monthly amount for a subscription
	 */
	private calculateMonthlyAmount(sub: Subscription): number {
		switch (sub.billingCycle) {
			case 'monthly':
				return sub.cost;
			case 'yearly':
				return sub.cost / 12;
			case 'custom':
				if (sub.billingCycleDays && sub.billingCycleDays > 0) {
					return (sub.cost / sub.billingCycleDays) * 30;
				}
				return sub.cost; // Fallback to cost as-is
			default:
				return sub.cost;
		}
	}

	/**
	 * Calculate yearly amount for a subscription
	 */
	private calculateYearlyAmount(sub: Subscription): number {
		switch (sub.billingCycle) {
			case 'monthly':
				return sub.cost * 12;
			case 'yearly':
				return sub.cost;
			case 'custom':
				if (sub.billingCycleDays && sub.billingCycleDays > 0) {
					return (sub.cost / sub.billingCycleDays) * 365;
				}
				return sub.cost * 12; // Fallback to monthly * 12
			default:
				return sub.cost * 12;
		}
	}

	/**
	 * Get days until next renewal
	 */
	getDaysUntilRenewal(subscription: Subscription): number {
		const now = Date.now();
		const diff = subscription.nextRenewal - now;
		return Math.ceil(diff / (24 * 60 * 60 * 1000));
	}

	/**
	 * Get days until trial ends
	 */
	getDaysUntilTrialEnds(subscription: Subscription): number | null {
		if (!subscription.isTrial || !subscription.trialEndDate) {
			return null;
		}
		const now = Date.now();
		const diff = subscription.trialEndDate - now;
		return Math.ceil(diff / (24 * 60 * 60 * 1000));
	}

	// ==================== SUBSCRIPTIONS CRUD ====================

	/**
	 * Set all subscriptions (used after fetching from API)
	 */
	setSubscriptions(subscriptions: Subscription[]) {
		this.subscriptions = subscriptions;
	}

	/**
	 * Add a new subscription (optimistic update)
	 */
	addSubscription(subscription: Subscription) {
		this.saveSnapshot();
		this.subscriptions.push(subscription);
	}

	/**
	 * Update an existing subscription (optimistic update)
	 */
	updateSubscription(subscriptionId: string, updates: Partial<Omit<Subscription, 'id' | 'userId'>>) {
		this.saveSnapshot();
		const index = this.subscriptions.findIndex((s) => s.id === subscriptionId);
		if (index !== -1) {
			this.subscriptions[index] = {
				...this.subscriptions[index],
				...updates,
				updatedAt: new Date().toISOString(),
			};
		}
	}

	/**
	 * Remove a subscription (optimistic update)
	 */
	removeSubscription(subscriptionId: string) {
		this.saveSnapshot();
		this.subscriptions = this.subscriptions.filter((s) => s.id !== subscriptionId);
	}

	/**
	 * Get a subscription by ID
	 */
	getSubscription(subscriptionId: string): Subscription | undefined {
		return this.subscriptions.find((s) => s.id === subscriptionId);
	}

	/**
	 * Search subscriptions by service name
	 */
	searchSubscriptions(query: string): Subscription[] {
		if (!query.trim()) return this.subscriptions;
		const lowerQuery = query.toLowerCase();
		return this.subscriptions.filter((s) => s.serviceName.toLowerCase().includes(lowerQuery));
	}

	/**
	 * Filter subscriptions by billing cycle
	 */
	filterByBillingCycle(cycle: BillingCycle): Subscription[] {
		return this.subscriptions.filter((s) => s.billingCycle === cycle);
	}

	/**
	 * Filter subscriptions by currency
	 */
	filterByCurrency(currency: Currency): Subscription[] {
		return this.subscriptions.filter((s) => s.currency === currency);
	}

	// ==================== OPTIMISTIC UPDATE HELPERS ====================

	/**
	 * Save current state for potential rollback
	 */
	private saveSnapshot() {
		this.previousSubscriptions = [...this.subscriptions];
	}

	/**
	 * Rollback to previous state (on API failure)
	 */
	rollback() {
		this.subscriptions = this.previousSubscriptions;
	}

	/**
	 * Commit changes (clear snapshot after successful API call)
	 */
	commit() {
		this.previousSubscriptions = [];
	}

	// ==================== LOADING & ERROR STATE ====================

	/**
	 * Set loading state
	 */
	setLoading(loading: boolean) {
		this.isLoading = loading;
	}

	/**
	 * Set error state
	 */
	setError(error: string | null) {
		this.error = error;
	}

	/**
	 * Clear error
	 */
	clearError() {
		this.error = null;
	}

	// ==================== BULK OPERATIONS ====================

	/**
	 * Clear all subscription data (on logout)
	 */
	clear() {
		this.subscriptions = [];
		this.isLoading = false;
		this.error = null;
		this.previousSubscriptions = [];
	}

	/**
	 * Load subscription data
	 */
	loadSubscriptions(subscriptions: Subscription[]) {
		this.subscriptions = subscriptions;
		this.isLoading = false;
		this.error = null;
	}
}

/**
 * Singleton subscriptions store instance
 */
export const subscriptionsStore = new SubscriptionsStore();
