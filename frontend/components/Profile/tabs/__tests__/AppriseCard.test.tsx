import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppriseCard from '../AppriseCard';
import {
    getAppriseConfig,
    removeAppriseConfig,
    saveAppriseConfig,
} from '../../../../utils/appriseService';

jest.mock('../../../../utils/appriseService', () => ({
    getAppriseConfig: jest.fn(),
    saveAppriseConfig: jest.fn(),
    removeAppriseConfig: jest.fn(),
}));

const mockGet = getAppriseConfig as jest.Mock;
const mockSave = saveAppriseConfig as jest.Mock;
const mockRemove = removeAppriseConfig as jest.Mock;

describe('AppriseCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('asks for the server and key when nothing is saved', async () => {
        mockGet.mockResolvedValue({ configured: false, host: null, tags: '' });
        const onStateChange = jest.fn();

        render(<AppriseCard onStateChange={onStateChange} />);

        await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(false));
        expect(
            screen.getByRole('textbox', { name: /apprise server address/i })
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('saves the server and reports it as configured', async () => {
        mockGet.mockResolvedValue({ configured: false, host: null, tags: '' });
        mockSave.mockResolvedValue({
            configured: true,
            host: '192.168.1.10:8000',
            tags: 'all',
        });
        const onStateChange = jest.fn();

        render(<AppriseCard onStateChange={onStateChange} />);
        await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(false));

        fireEvent.change(
            screen.getByRole('textbox', { name: /apprise server address/i }),
            { target: { value: 'http://192.168.1.10:8000' } }
        );
        fireEvent.change(screen.getByLabelText(/config key/i), {
            target: { value: 'phone' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: /tags/i }), {
            target: { value: 'all' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() =>
            expect(mockSave).toHaveBeenCalledWith({
                url: 'http://192.168.1.10:8000',
                key: 'phone',
                tags: 'all',
            })
        );
        await waitFor(() =>
            expect(onStateChange).toHaveBeenLastCalledWith(true)
        );
    });

    it('can sit inside the settings form without nesting a form', async () => {
        mockGet.mockResolvedValue({ configured: false, host: null, tags: '' });
        mockSave.mockResolvedValue({
            configured: true,
            host: '192.168.1.10:8000',
            tags: '',
        });
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const onOuterSubmit = jest.fn((e: React.FormEvent) =>
            e.preventDefault()
        );

        const { container } = render(
            <form onSubmit={onOuterSubmit}>
                <AppriseCard onStateChange={jest.fn()} />
            </form>
        );
        const server = await screen.findByRole('textbox', {
            name: /apprise server address/i,
        });

        expect(container.querySelectorAll('form')).toHaveLength(1);
        expect(consoleError).not.toHaveBeenCalled();

        fireEvent.change(server, {
            target: { value: 'http://192.168.1.10:8000' },
        });
        fireEvent.change(screen.getByLabelText(/config key/i), {
            target: { value: 'phone' },
        });
        fireEvent.keyDown(screen.getByLabelText(/config key/i), {
            key: 'Enter',
        });

        await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
        expect(onOuterSubmit).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('removes a saved server', async () => {
        mockGet.mockResolvedValue({
            configured: true,
            host: '192.168.1.10:8000',
            tags: '',
        });
        mockRemove.mockResolvedValue({
            configured: false,
            host: null,
            tags: '',
        });
        const onStateChange = jest.fn();

        render(<AppriseCard onStateChange={onStateChange} />);
        await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(true));

        fireEvent.click(screen.getByRole('button', { name: /remove/i }));

        await waitFor(() => expect(mockRemove).toHaveBeenCalled());
        await waitFor(() =>
            expect(onStateChange).toHaveBeenLastCalledWith(false)
        );
    });
});
