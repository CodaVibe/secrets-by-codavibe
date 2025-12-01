import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ServiceDetail from './ServiceDetail.svelte';
import { vaultStore } from '$lib/stores/vault.svelte';
import { authStore } from '$lib/stores/auth.svelte';
import type { Service, Credential } from '$lib/stores/vault.svelte';

describe('ServiceDetail', () => {
	const mockService: Service = {
		id: 'service-1',
		userId: 'user-1',
		name: 'GitHub',
		icon: 'https://github.com/favicon.ico',
		createdAt: '2025-01-01T00:00:00Z',
		updatedAt: '2025-01-01T00:00:00Z'
	};

	const mockCredentials: Credential[] = [
		{
			id: 'cred-1',
			serviceId: 'service-1',
			type: 'username',
			label: 'Username',
			encryptedValue: '1234567890abcdef',
			iv: 'abcdef1234567890',
			displayOrder: 0,
			createdAt: '2025-01-01T00:00:00Z',
			updatedAt: '2025-01-01T00:00:00Z'
		},
		{
			id: 'cred-2',
			serviceId: 'service-1',
			type: 'password',
			label: 'Password',
			encryptedValue: 'fedcba0987654321',
			iv: '0987654321fedcba',
			displayOrder: 1,
			createdAt: '2025-01-01T00:00:00Z',
			updatedAt: '2025-01-01T00:00:00Z'
		}
	];

	beforeEach(() => {
		// Clear vault store
		vaultStore.clear();

		// Add mock service and credentials
		vaultStore.addService(mockService);
		mockCredentials.forEach((cred) => vaultStore.addCredential(cred));

		// Mock auth store with DEK
		authStore.login({
			userId: 'user-1',
			sessionToken: 'token-123',
			dek: new Uint8Array(32),
			email: 'test@example.com'
		});
	});

	it('should render service name and icon', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		expect(screen.getByText('GitHub')).toBeTruthy();
		const icon = screen.getByAltText('') as HTMLImageElement;
		expect(icon.src).toBe('https://github.com/favicon.ico');
	});

	it('should render service name with placeholder icon when no icon provided', () => {
		const serviceWithoutIcon: Service = { ...mockService, icon: undefined };
		vaultStore.updateService('service-1', { icon: undefined });

		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		expect(screen.getByText('GitHub')).toBeTruthy();
		expect(screen.getByText('G')).toBeTruthy(); // First letter placeholder
	});

	it('should render credentials list', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		expect(screen.getByText('Username')).toBeTruthy();
		expect(screen.getByText('Password')).toBeTruthy();
		expect(screen.getByText('username')).toBeTruthy();
		expect(screen.getByText('password')).toBeTruthy();
	});

	it('should hide credential values by default', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		const hiddenValues = screen.getAllByText('••••••••');
		expect(hiddenValues.length).toBe(2);
	});

	it('should show empty state when no credentials', () => {
		vaultStore.clear();
		vaultStore.addService(mockService);

		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		expect(screen.getByText('No credentials yet')).toBeTruthy();
		expect(screen.getByText('Add your first credential to get started')).toBeTruthy();
	});

	it('should show "Service not found" when service does not exist', () => {
		render(ServiceDetail, { props: { serviceId: 'non-existent' } });

		expect(screen.getByText('Service not found')).toBeTruthy();
	});

	it('should call onAddCredential when Add Credential button is clicked', async () => {
		const onAddCredential = vi.fn();
		const { component } = render(ServiceDetail, {
			props: { serviceId: 'service-1', onAddCredential }
		});

		const addButtons = screen.getAllByText('Add Credential');
		addButtons[0].click();

		expect(onAddCredential).toHaveBeenCalledOnce();
	});

	it('should render credential type icons', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		// Check for emoji icons (username: 👤, password: 🔑)
		const icons = document.querySelectorAll('.credential-icon');
		expect(icons.length).toBe(2);
		expect(icons[0].textContent).toBe('👤');
		expect(icons[1].textContent).toBe('🔑');
	});

	it('should render reorder buttons for each credential', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		const upButtons = screen.getAllByLabelText(/Move up/);
		const downButtons = screen.getAllByLabelText(/Move down/);

		expect(upButtons.length).toBe(2);
		expect(downButtons.length).toBe(2);
	});

	it('should disable up button for first credential', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		const upButtons = screen.getAllByLabelText(/Move up/) as HTMLButtonElement[];
		expect(upButtons[0].disabled).toBe(true);
		expect(upButtons[1].disabled).toBe(false);
	});

	it('should disable down button for last credential', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		const downButtons = screen.getAllByLabelText(/Move down/) as HTMLButtonElement[];
		expect(downButtons[0].disabled).toBe(false);
		expect(downButtons[1].disabled).toBe(true);
	});

	it('should render edit and delete buttons for each credential', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		const editButtons = screen.getAllByLabelText(/Edit/);
		const deleteButtons = screen.getAllByLabelText(/Delete/);

		expect(editButtons.length).toBe(2);
		expect(deleteButtons.length).toBe(2);
	});

	it('should call onEditCredential when edit button is clicked', () => {
		const onEditCredential = vi.fn();
		render(ServiceDetail, {
			props: { serviceId: 'service-1', onEditCredential }
		});

		const editButtons = screen.getAllByLabelText(/Edit/);
		editButtons[0].click();

		expect(onEditCredential).toHaveBeenCalledWith('cred-1');
	});

	it('should render reveal and copy buttons for each credential', () => {
		render(ServiceDetail, { props: { serviceId: 'service-1' } });

		const revealButtons = screen.getAllByText(/Reveal/);
		const copyButtons = screen.getAllByText(/Copy/);

		expect(revealButtons.length).toBe(2);
		expect(copyButtons.length).toBe(2);
	});
});
