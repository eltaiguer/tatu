import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

vi.mock('./components/Dashboard', () => ({
  Dashboard: () => <h2>Dashboard View</h2>,
}));

vi.mock('./components/ImportCSV', () => ({
  ImportCSV: () => <h2>Importar Transacciones</h2>,
}));

vi.mock('./components/Tools', () => ({
  Tools: () => <h2>Herramientas</h2>,
}));

vi.mock('./components/Transactions', () => ({
  Transactions: () => <h2>Transacciones</h2>,
}));

vi.mock('./components/Charts', () => ({
  Charts: () => <h2>Insights y Análisis</h2>,
}));

describe('App', () => {
  it('renders dashboard by default', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Dashboard View' })).toBeInTheDocument();
  });

  it('shows import flow when navigating to Importar', async () => {
    const user = userEvent.setup();

    render(<App />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Importar' }));
    });

    expect(screen.getByRole('heading', { name: 'Importar Transacciones' })).toBeInTheDocument();
  });

  it('shows tools page when navigating to Herramientas', async () => {
    const user = userEvent.setup();

    render(<App />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Herramientas' }));
    });

    expect(screen.getByRole('heading', { name: 'Herramientas' })).toBeInTheDocument();
  });

  it('shows transactions when navigating to Transacciones', async () => {
    const user = userEvent.setup();

    render(<App />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Transacciones' }));
    });

    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument();
  });

  it('shows insights charts when navigating to Insights', async () => {
    const user = userEvent.setup();

    render(<App />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Insights' }));
    });

    expect(screen.getByRole('heading', { name: 'Insights y Análisis' })).toBeInTheDocument();
  });
});
