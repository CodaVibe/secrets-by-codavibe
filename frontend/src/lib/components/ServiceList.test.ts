import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import ServiceList from './ServiceList.svelte';
import { vaultStore } from '$lib/stores/vault.svelte';

describe('ServiceList Component', () => {
	beforeEach(() => {
		// Clear vault store before each test
		vaultStore.clear();
	});

	it('renders empty state when no services', () => {
		const { getByText } = render(ServiceList);
		expect(getByText('No services yet')).toBeTruthy();
	});

	it('renders service count', () => {
		vaultStore.setServices([
			{
				id: '1',
				userId: 'user1',
				name: 'GitHub',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		]);

		const { getByText } = render(ServiceList);
		expect(getByText('1 service')).toBeTruthy();
	});

	it('renders multiple services', () => {
		vaultStore.setServices([
			{
				id: '1',
				userId: 'user1',
				name: 'GitHub',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '2',
				userId: 'user1',
				name: 'Gmail',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		]);

		const { getByText } = render(ServiceList);
		expect(getByText('2 services')).toBeTruthy();
		expect(getByText('GitHub')).toBeTruthy();
		expect(getByText('Gmail')).toBeTruthy();
	});

	it('filters services by search query', async () => {
		const { waitFor } = await import('@testing-library/svelte');
		
		vaultStore.setServices([
			{
				id: '1',
				userId: 'user1',
				name: 'GitHub',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '2',
				userId: 'user1',
				name: 'Gmail',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		]);

		const { getByPlaceholderText, getByText, queryByText } = render(ServiceList);
		const searchInput = getByPlaceholderText('Search services...') as HTMLInputElement;

		// Type in search
		searchInput.value = 'git';
		searchInput.dispatchEvent(new Event('input', { bubbles: true }));

		// Wait for reactivity to update
		await waitFor(() => {
			expect(getByText('GitHub')).toBeTruthy();
			expect(queryByText('Gmail')).toBeNull();
		});
	});
});
